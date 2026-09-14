-- ════════════════════════════════════════════════════════════════════
--  광고 규격 내보내기를 사용량 장부에 들인다
--
--  **지금까지 이 도구는 장부에 한 줄도 없었다.** 크레딧도 안 깎이고, 배경
--  제거에 쓴 돈도 어디에도 안 남았다.
--
--  하는 일은 셋이다.
--    1. `generation_events` 의 operation 목록에 `ad_export` 를 더한다
--    2. `reserve_generation()` 의 화이트리스트에도 같은 값을 더한다
--    3. 배경 제거 모델의 단가를 `model_prices` 에 넣는다
--
--  **1과 2를 함께 해야 한다.** 2026-09-08 에 1만 하고 2를 빠뜨려서, 이미지
--  만들기와 카드뉴스가 전부 `invalid_request` 로 거절됐다(202609090001 이
--  그것을 고쳤다). 둘 중 좁은 쪽이 실제 한계다.
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌면 예약이 거절되고 사용자는 「사용량을 확인하지 못했습니다」만
--        본다. 반대 순서로 먼저 넣어도 옛 코드는 이 값을 쓰지 않으므로 안전하다.
--
--  여러 번 돌려도 안전하다. 기존 행은 건드리지 않는다.
-- ════════════════════════════════════════════════════════════════════

alter table public.generation_events
  drop constraint if exists generation_events_operation_check;

alter table public.generation_events
  add constraint generation_events_operation_check
  check (operation in (
    'pdp_analyze',
    'pdp_image',
    'redesign_generate',
    'redesign_edit',
    'poster_image',
    'sns_image',
    -- 광고 규격 내보내기 (/ad). 새로 그리지 않으므로 원가는 배경 제거 호출뿐이다.
    'ad_export'
  ));

-- ── 예약 함수의 목록도 같이 넓힌다 ───────────────────────────────────
--
-- 본문은 202609090001 판 그대로다. 목록 한 줄만 넓힌다 — 돈이 오가는 자리에
-- 「하는 김에」를 섞지 않는다.

create or replace function public.reserve_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_units integer,
  p_analysis_limit integer default 10
)
returns table (
  allowed boolean,
  reason text,
  used_units integer,
  reserved_units integer,
  quota integer,
  current_period_start date,
  current_period_end date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_period_start date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_period_end date := (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date;
  v_used integer := 0;
  v_reserved integer := 0;
  v_recent_analysis integer := 0;
  v_inflight integer := 0;
  v_team_id uuid;
  v_quota integer;
begin
  if p_operation not in (
       'pdp_analyze', 'pdp_image', 'redesign_generate', 'redesign_edit',
       'poster_image', 'sns_image', 'ad_export'
     )
     or p_units < 0 or p_units > public.max_reserve_units() then
    return query select false, 'invalid_request', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 'profile_not_found', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;

  select tm.team_id into v_team_id
    from public.team_members tm where tm.user_id = p_user_id;
  v_quota := public.effective_quota(p_user_id, v_team_id, v_profile.monthly_quota, v_period_start);

  if v_profile.email_confirmed_at is null then
    return query select false, 'email_unconfirmed', 0, 0, v_quota, v_period_start, v_period_end;
    return;
  end if;
  if v_profile.status <> 'active' then
    return query select false, v_profile.status, 0, 0, v_quota, v_period_start, v_period_end;
    return;
  end if;

  update public.generation_events
    set status = 'failed', completed_at = now(), error_code = 'reservation_expired'
    where user_id = p_user_id and status = 'reserved' and expires_at <= now();

  if exists (
    select 1 from public.generation_events
    where user_id = p_user_id and request_id = p_request_id
  ) then
    select coalesce(sum(consumed_units), 0)::integer into v_used
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
    select coalesce(sum(requested_units), 0)::integer into v_reserved
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();
    return query select false, 'duplicate_request', v_used, v_reserved, v_quota, v_period_start, v_period_end;
    return;
  end if;

  if p_operation = 'pdp_analyze' then
    select count(*)::integer into v_recent_analysis
      from public.generation_events
      where user_id = p_user_id
        and operation = 'pdp_analyze'
        and created_at > now() - interval '1 hour'
        and error_code is distinct from 'reservation_expired';
    if v_recent_analysis >= least(greatest(p_analysis_limit, 1), 1000) then
      return query select false, 'analysis_rate_limit', 0, 0, v_quota, v_period_start, v_period_end;
      return;
    end if;
  elsif p_units > 0 then
    select count(*)::integer into v_inflight
      from public.generation_events
      where user_id = p_user_id and status = 'reserved' and expires_at > now() and requested_units > 0;
    if v_inflight >= 1 then
      return query select false, 'concurrent_limit', 0, 0, v_quota, v_period_start, v_period_end;
      return;
    end if;
  end if;

  select coalesce(sum(consumed_units), 0)::integer into v_used
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
  select coalesce(sum(requested_units), 0)::integer into v_reserved
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();

  if v_used + v_reserved + p_units > v_quota then
    -- 팀 때문에 막혔나. 개인 상한만 봤으면 통과했을 것이면 팀 탓이다.
    return query select
      false,
      case
        when v_used + v_reserved + p_units <= v_profile.monthly_quota then 'team_quota_exceeded'
        else 'quota_exceeded'
      end,
      v_used, v_reserved, v_quota, v_period_start, v_period_end;
    return;
  end if;

  insert into public.generation_events (
    user_id, request_id, operation, period_start, requested_units, expires_at, team_id
  ) values (
    p_user_id, p_request_id, p_operation, v_period_start, p_units, now() + interval '10 minutes', v_team_id
  );

  return query select true, 'ok', v_used, v_reserved + p_units, v_quota, v_period_start, v_period_end;
end;
$$;

-- ── 배경 제거 단가 ───────────────────────────────────────────────────
--
-- 이 행이 없으면 원가 집계에서 $0 으로 잡힌다. 같은 일이 2026-09-10 에
-- 세 모델에서 이미 났다.
--
-- $0.003 은 `lib/ad/master-plan.ts` 의 주석이 적어 둔 값이다(「잃는 것이
-- 0.4원」). 청구서로 확인되면 이 행만 고친다.

insert into public.model_prices (model, label, unit_cost_usd, note) values
  ('fal-ai/birefnet/v2',
   '배경 제거 (BiRefNet v2)',
   0.00300,
   '광고 규격 내보내기의 투명 배너 전용. 마스터 한 장당 한 번 부른다. 청구서로 확인되면 이 행을 고친다.')
on conflict (model) do nothing;

-- 확인:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.generation_events'::regclass
--     and conname = 'generation_events_operation_check';
--   select model, unit_cost_usd from public.model_prices where model = 'fal-ai/birefnet/v2';
