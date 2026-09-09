-- ════════════════════════════════════════════════════════════════════
--  예약 함수도 이미지 만들기·카드뉴스를 받아들인다
--
--  202609080001 은 `generation_events` 의 check 제약만 넓혔다. 그런데 값이
--  표에 닿기 전에 `reserve_generation()` 안의 화이트리스트가 먼저 걸렀다.
--
--    if p_operation not in ('pdp_analyze','pdp_image','redesign_generate','redesign_edit')
--
--  그 결과 /poster 의 「만들기」와 /sns 의 「그림 만들기」가 전부
--  `allowed=false, reason='invalid_request'` 로 거절됐다. 사용자에게는
--  409 「요청을 처리할 수 없습니다」만 뜨고 그림은 한 장도 안 나왔다.
--
--  하는 일: 함수를 그대로 다시 만들면서 목록 한 줄만 넓힌다. 나머지 본문은
--  202609070005 판 그대로다 — 돈이 오가는 자리에 「하는 김에」를 섞지 않는다.
--
--  이 목록은 202609080001 의 check 제약과 같아야 한다. 한쪽만 넓히면
--  이번과 똑같은 일이 난다. 둘 중 좁은 쪽이 실제 한계다.
-- ════════════════════════════════════════════════════════════════════

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
       'poster_image', 'sns_image'
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
