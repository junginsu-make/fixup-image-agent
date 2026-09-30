-- 관리자 AI 비용 화면과 「AI 전체 멈춤」 스위치 (설계 2026-09-30 §3.3·§3.4 · C4).
--
-- ⚠ 공유 DB — detail-page-studio 가 기존 `admin_cost_summary/by_member/by_operation/by_model/daily`
--   를 그대로 부른다. **그 함수들은 고치지 않는다.** 이 파일은 새 함수 둘만 더한다.
-- ⚠ 순서 — 202609300002(ai_cost_events) 뒤, 앱보다 먼저.
--
-- 「오늘」「이번 달」은 **한국 시각**이다. 기존 `admin_cost_*` 는 DB 시각(UTC)으로 잘라
-- 한국 0시~9시 호출이 「어제」로 잡힌다(202609100004).

create or replace function public.admin_ai_cost_report(
  p_days integer default 30,
  p_now timestamptz default now()
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      least(greatest(coalesce(p_days, 30), 1), 366) as days,
      date_trunc('day', p_now at time zone 'Asia/Seoul') as today_local,
      date_trunc('day', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as today_start,
      date_trunc('month', p_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as month_start
  ),
  win as (
    select b.*, (b.today_local - make_interval(days => b.days - 1)) at time zone 'Asia/Seoul' as window_start
    from bounds b
  ),
  picked as (
    select e.created_at, e.provider, e.operation, e.usd, e.images
    from ai_cost_events e, win w
    where e.created_at >= least(w.window_start, w.month_start) and e.created_at <= p_now
  ),
  calendar as (
    select g::date as day
    from win w, generate_series(w.today_local - make_interval(days => w.days - 1), w.today_local, interval '1 day') g
  ),
  per_day as (
    select (r.created_at at time zone 'Asia/Seoul')::date as day, sum(r.usd) as usd, count(*) as calls
    from picked r, win w where r.created_at >= w.window_start group by 1
  )
  select jsonb_build_object(
    'days', (select days from win),
    'today_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.today_start), 0),
    'month_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.month_start), 0),
    'window_usd', coalesce((select sum(r.usd) from picked r, win w where r.created_at >= w.window_start), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'usd', coalesce(p.usd, 0), 'calls', coalesce(p.calls, 0)) order by d.day)
      from calendar d left join per_day p on p.day = d.day), '[]'::jsonb),
    'by_provider', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.provider, 'usd', x.usd, 'calls', x.calls, 'images', x.images) order by x.usd desc, x.provider)
      from (select r.provider, sum(r.usd) as usd, count(*) as calls, sum(r.images) as images
              from picked r, win w where r.created_at >= w.window_start group by r.provider) x), '[]'::jsonb),
    'by_operation', coalesce((
      select jsonb_agg(jsonb_build_object('key', x.operation, 'usd', x.usd, 'calls', x.calls, 'images', x.images) order by x.usd desc, x.operation)
      from (select r.operation, sum(r.usd) as usd, count(*) as calls, sum(r.images) as images
              from picked r, win w where r.created_at >= w.window_start group by r.operation) x), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_ai_cost_report(integer, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_cost_report(integer, timestamptz) to service_role;

-- ── AI 전체 멈춤 스위치 ────────────────────────────────────────────
--
-- 값은 **정확히 '1'/'0'** 만 쓴다. `credit_reserve`(202609300001)는 `value='1'` 만 멈춤으로 본다.
-- 바꿀 때마다 `credit_admin_events` 에 한 줄(action `ai_pause`/`ai_resume`, target_ids '{}') — 새 표 없음.
-- 같은 값으로 다시 누르면 아무것도 안 적는다.

create or replace function public.admin_set_ai_paused(
  p_actor uuid,
  p_paused boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text;
begin
  if p_paused is null then raise exception 'admin_set_ai_paused: paused_required'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'admin_set_ai_paused: reason_required'; end if;
  if not exists (select 1 from profiles where id = p_actor and role = 'admin' and status = 'active') then
    raise exception 'admin_set_ai_paused: admin_required';
  end if;

  v_new := case when p_paused then '1' else '0' end;
  select value into v_old from app_settings where key = 'ai_paused' for update;
  if coalesce(v_old, '0') = v_new then
    return jsonb_build_object('paused', p_paused, 'changed', false);
  end if;

  insert into app_settings(key, value, updated_at) values ('ai_paused', v_new, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input, result)
  values (gen_random_uuid(), p_actor, case when p_paused then 'ai_pause' else 'ai_resume' end,
          '{}'::uuid[], p_reason, jsonb_build_object('paused', p_paused, 'previous', v_old),
          jsonb_build_object('value', v_new));

  return jsonb_build_object('paused', p_paused, 'changed', true);
end $$;

revoke all on function public.admin_set_ai_paused(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_ai_paused(uuid, boolean, text) to service_role;

do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('admin_ai_cost_report', 'admin_set_ai_paused')) <> 2 then
    raise exception 'admin_ai_cost_report·admin_set_ai_paused 가 하나씩이 아닙니다';
  end if;
  raise notice 'AI 비용 보고·멈춤 스위치 함수를 하나씩 만들었습니다.';
end $$;
