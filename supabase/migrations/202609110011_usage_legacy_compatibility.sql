-- Preserve the v1 API contract while v2 drains and migrates.
-- Old expiry cleanup cannot release v2 holds. Old finalize cannot settle v2.
-- Historical v1 reservation_expired can finalize late; other failures remain terminal.
begin;

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
  perform public.lock_usage_budget();
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
    where user_id = p_user_id and status = 'reserved' and protocol_version = 1 and expires_at <= now();

  if exists (
    select 1 from public.generation_events
    where user_id = p_user_id and request_id = p_request_id
  ) then
    select coalesce(sum(consumed_units), 0)::integer into v_used
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
    select coalesce(sum(requested_units), 0)::integer into v_reserved
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and (protocol_version = 2 or expires_at > now());
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
      where user_id = p_user_id and status = 'reserved' and (protocol_version = 2 or expires_at > now()) and requested_units > 0;
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
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and (protocol_version = 2 or expires_at > now());

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

create or replace function public.finalize_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_success boolean,
  p_consumed_units integer default 0,
  p_error_code text default null
)
returns table (
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
  v_event public.generation_events%rowtype;
  v_quota integer;
  v_period_start date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_period_end date := (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date;
  v_used integer := 0;
  v_reserved integer := 0;
begin
  perform public.lock_usage_budget();
  select * into v_event from public.generation_events
    where user_id = p_user_id and request_id = p_request_id for update;
  if not found then raise exception 'generation reservation not found'; end if;

  if v_event.protocol_version = 2 then raise exception 'use_v2_settlement'; end if;

  if v_event.status = 'reserved' or (v_event.status = 'failed' and v_event.error_code = 'reservation_expired') then
    update public.generation_events
      set status = case when p_success then 'succeeded' else 'failed' end,
          consumed_units = case when p_success then least(greatest(p_consumed_units, 0), requested_units) else 0 end,
          error_code = case when p_success then null else coalesce(p_error_code, 'provider_error') end,
          completed_at = now()
      where id = v_event.id;
  end if;

  select monthly_quota into v_quota from public.profiles where id = p_user_id;
  select coalesce(sum(consumed_units), 0)::integer into v_used
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
  select coalesce(sum(requested_units), 0)::integer into v_reserved
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and (protocol_version = 2 or expires_at > now());
  return query select v_used, v_reserved, coalesce(v_quota, 0), v_period_start, v_period_end;
end;
$$;

create or replace function public.team_units_used(
  p_team_id uuid,
  p_period_start date,
  p_exclude_user uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when status = 'succeeded' then consumed_units
      when status = 'reserved' and (protocol_version = 2 or expires_at > now()) then requested_units
      else 0
    end
  ), 0)::integer
  from public.generation_events
  where team_id = p_team_id
    and period_start = p_period_start
    and user_id is distinct from p_exclude_user;
$$;

create or replace function public.member_usage_summary(p_user_id uuid)
returns table (
  used_units bigint,
  reserved_units bigint,
  quota integer,
  current_period_start date,
  current_period_end date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(events.consumed_units) filter (where events.status = 'succeeded'), 0)::bigint,
    coalesce(sum(events.requested_units) filter (
      where events.status = 'reserved' and (events.protocol_version = 2 or events.expires_at > now())
    ), 0)::bigint,
    public.effective_quota(
      profiles.id,
      (select tm.team_id from public.team_members tm where tm.user_id = profiles.id),
      profiles.monthly_quota,
      date_trunc('month', now() at time zone 'Asia/Seoul')::date
    ),
    date_trunc('month', now() at time zone 'Asia/Seoul')::date,
    (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date
  from public.profiles profiles
  left join public.generation_events events
    on events.user_id = profiles.id
   and events.period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
  where profiles.id = p_user_id
  group by profiles.id, profiles.monthly_quota;
$$;

commit;
