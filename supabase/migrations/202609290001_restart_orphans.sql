-- 재시작 때 묶인 예약 정리(2026-09-29 설계 §3.5).
--
-- 서버가 죽거나 배포로 다시 뜨면, 직전 프로세스의 **동기** 이미지 생성 예약이 크레딧을 쥔
-- 채 남는다. 동시 1건 규칙은 10분 뒤 풀리지만 잡아 둔 크레딧은 안 풀리고, `started` 로 죽은
-- 건은 관리자 「정산 확인」(needs_review 만 봄)에도 안 보였다.
--
-- ── 누구 것인가 ───────────────────────────────────────────────────
--
-- 예약마다 그것을 잡은 프로세스 표식(`boot_id`)을 남긴다. 앱이 예약 직후 한 줄로 적는다 —
-- `credit_reserve` 인자를 바꾸면 같은 이름 함수가 둘이 되는 42725 사고(202609280003)가 난다.
-- 이 DB 는 상세페이지 제품과 함께 쓴다. 저쪽 예약은 표식이 없어 절대 고르지 않는다.
--
-- ── 무엇을 고르나 ─────────────────────────────────────────────────
--
-- 와일드카드 없는 허용 목록 — 우리 서버가 응답을 붙잡고 기다리는 동기 경로만. 카드뉴스·
-- 포스터는 fal 대기열에 맡기고 재시작 뒤에도 이어지는 설계라 **절대 대상이 아니다.**
-- 배치기 작업(`pdp:job`, S4)도 재시작을 넘어 이어지므로 목록에 없다.
--
-- 전제: 웹 프로세스는 하나다. 둘이 되면 살아 있는 형제 프로세스의 예약을 고른다.

alter table public.generation_events add column if not exists boot_id uuid;
create index if not exists generation_events_restart_orphans_idx
  on public.generation_events (boot_id)
  where status = 'reserved' and boot_id is not null;

create or replace function public.credit_close_restart_orphans(p_boot uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e generation_events%rowtype;
  v_released integer := 0;
  v_review integer := 0;
begin
  if p_boot is null then raise exception 'boot_required'; end if;
  for e in
    select * from generation_events g
     where g.boot_id is not null and g.boot_id <> p_boot
       and g.pricing_policy = 'image-v2' and g.status = 'reserved'
       and g.credit_quote->>'resource' in ('pdp:batch','pdp:image','pdp:key-visual','redesign:generate',
                                           'redesign:edit','character:candidates','character:angles','character:view')
       and not exists (select 1 from credit_jobs j where j.user_id = g.user_id and j.request_id = g.request_id)
     order by g.created_at
  loop
    begin
      if e.credit_phase = 'reserved' then
        -- 제공사를 아직 안 불렀다 — 원가도 없다. 차감 없이 푼다.
        perform credit_finalize(e.user_id, e.request_id, array[]::integer[], true, 'process_restart');
        v_released := v_released + 1;
      elsif e.credit_phase = 'started' then
        -- 불렀는데 결과를 모른다 — TTL 로 풀지 않고 사람이 본다(장부 설계 :717).
        update generation_events
           set credit_phase = 'needs_review', error_code = 'process_restart', cost_state = 'unknown'
         where id = e.id;
        v_review := v_review + 1;
      end if;
    exception when others then
      -- 한 건이 나머지를 막지 않는다. 남은 건은 다음 기동 때 다시 본다.
      raise warning 'credit_close_restart_orphans: % % — %', e.user_id, e.request_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('released', v_released, 'needs_review', v_review);
end $$;

revoke all on function public.credit_close_restart_orphans(uuid) from public, anon, authenticated;
grant execute on function public.credit_close_restart_orphans(uuid) to service_role;

-- 확인:
--   select column_name from information_schema.columns where table_name='generation_events' and column_name='boot_id';
--   select credit_close_restart_orphans(gen_random_uuid());  -- 처음에는 {"released":0,"needs_review":0}
