-- 이미지 모델 선택으로 크레딧 가중치가 생기면서 한 번에 예약하는 units 가 커졌다.
--   6장 × GPT Image 2 가중치 4 = 24  (기존 상한 10 을 넘는다)
--   최대 조합은 7섹션 × 4 = 28 이라 60 이면 충분하다.
--
-- 상한을 올리지 않으면 배치 예약이 invalid_request 로 거부되고,
-- 동시 생성(concurrent_limit 1건)을 우회할 방법이 없어진다.
--
-- 바뀌는 것은 아래 함수의 상한 한 곳뿐이다. 기존 데이터에 영향이 없고
-- 되돌릴 때는 60 을 10 으로 되돌리면 된다.

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
begin
  if p_operation not in ('pdp_analyze', 'pdp_image', 'redesign_generate', 'redesign_edit')
     or p_units < 0 or p_units > 60 then
    return query select false, 'invalid_request', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 'profile_not_found', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;
  if v_profile.email_confirmed_at is null then
    return query select false, 'email_unconfirmed', 0, 0, v_profile.monthly_quota, v_period_start, v_period_end;
    return;
  end if;
  if v_profile.status <> 'active' then
    return query select false, v_profile.status, 0, 0, v_profile.monthly_quota, v_period_start, v_period_end;
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
    return query select false, 'duplicate_request', v_used, v_reserved, v_profile.monthly_quota, v_period_start, v_period_end;
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
      return query select false, 'analysis_rate_limit', 0, 0, v_profile.monthly_quota, v_period_start, v_period_end;
      return;
    end if;
  elsif p_units > 0 then
    select count(*)::integer into v_inflight
      from public.generation_events
      where user_id = p_user_id and status = 'reserved' and expires_at > now() and requested_units > 0;
    if v_inflight >= 1 then
      return query select false, 'concurrent_limit', 0, 0, v_profile.monthly_quota, v_period_start, v_period_end;
      return;
    end if;
  end if;

  select coalesce(sum(consumed_units), 0)::integer into v_used
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
  select coalesce(sum(requested_units), 0)::integer into v_reserved
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();

  if v_used + v_reserved + p_units > v_profile.monthly_quota then
    return query select false, 'quota_exceeded', v_used, v_reserved, v_profile.monthly_quota, v_period_start, v_period_end;
    return;
  end if;

  insert into public.generation_events (
    user_id, request_id, operation, period_start, requested_units, expires_at
  ) values (
    p_user_id, p_request_id, p_operation, v_period_start, p_units, now() + interval '10 minutes'
  );

  return query select true, 'ok', v_used, v_reserved + p_units, v_profile.monthly_quota, v_period_start, v_period_end;
end;
$$;
