-- AI Detail Page Studio: membership, approval, and monthly image credits.
-- Apply to a dedicated Supabase project. All quota mutations are server-only.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  email_confirmed_at timestamptz,
  role text not null default 'member' check (role in ('member', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  monthly_quota integer not null default 30 check (monthly_quota >= 0 and monthly_quota <= 10000),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approval_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('pdp_analyze', 'pdp_image', 'redesign_generate', 'redesign_edit')),
  period_start date not null,
  requested_units integer not null default 0 check (requested_units >= 0 and requested_units <= 10),
  consumed_units integer not null default 0 check (consumed_units >= 0 and consumed_units <= requested_units),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed')),
  error_code text,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists generation_events_user_period_idx
  on public.generation_events(user_id, period_start, status);
create index if not exists generation_events_created_idx
  on public.generation_events(created_at desc);
create index if not exists profiles_status_created_idx
  on public.profiles(status, created_at desc);

alter table public.profiles enable row level security;
alter table public.generation_events enable row level security;

revoke all on public.profiles from anon;
revoke all on public.generation_events from anon;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.generation_events from authenticated;
grant select on public.profiles to authenticated;
grant select on public.generation_events to authenticated;

drop policy if exists "members read own profile" on public.profiles;
create policy "members read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "members read own usage" on public.generation_events;
create policy "members read own usage"
  on public.generation_events for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, email_confirmed_at)
  values (new.id, coalesce(new.email, ''), new.email_confirmed_at)
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_auth_user_profile on auth.users;
create trigger sync_auth_user_profile
after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.sync_auth_user_profile();

-- The trigger only covers future changes. Backfill users that existed before
-- this migration so the bootstrap-admin step cannot target a missing profile.
insert into public.profiles (id, email, email_confirmed_at)
select id, coalesce(email, ''), email_confirmed_at
from auth.users
on conflict (id) do update
  set email = excluded.email,
      email_confirmed_at = excluded.email_confirmed_at,
      updated_at = now();

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
     or p_units < 0 or p_units > 10 then
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
  select * into v_event from public.generation_events
    where user_id = p_user_id and request_id = p_request_id for update;
  if not found then raise exception 'generation reservation not found'; end if;

  if v_event.status = 'reserved' then
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
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();
  return query select v_used, v_reserved, coalesce(v_quota, 0), v_period_start, v_period_end;
end;
$$;

create or replace function public.admin_usage_summary()
returns table (
  today_units bigint,
  month_units bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(consumed_units) filter (
      where (created_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
    ), 0)::bigint as today_units,
    coalesce(sum(consumed_units) filter (
      where period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
    ), 0)::bigint as month_units
  from public.generation_events
  where status = 'succeeded';
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
      where events.status = 'reserved' and events.expires_at > now()
    ), 0)::bigint,
    profiles.monthly_quota,
    date_trunc('month', now() at time zone 'Asia/Seoul')::date,
    (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date
  from public.profiles profiles
  left join public.generation_events events
    on events.user_id = profiles.id
   and events.period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
  where profiles.id = p_user_id
  group by profiles.monthly_quota;
$$;

create or replace function public.admin_usage_daily(p_days integer default 30)
returns table (
  usage_date date,
  consumed_units bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      (now() at time zone 'Asia/Seoul')::date - (least(greatest(p_days, 1), 90) - 1),
      (now() at time zone 'Asia/Seoul')::date,
      interval '1 day'
    )::date as usage_date
  )
  select days.usage_date, coalesce(sum(events.consumed_units), 0)::bigint
  from days
  left join public.generation_events events
    on (events.created_at at time zone 'Asia/Seoul')::date = days.usage_date
   and events.status = 'succeeded'
  group by days.usage_date
  order by days.usage_date;
$$;

create or replace function public.admin_usage_top(p_limit integer default 10)
returns table (
  user_id uuid,
  email text,
  consumed_units bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select events.user_id, profiles.email, sum(events.consumed_units)::bigint as consumed_units
  from public.generation_events events
  join public.profiles profiles on profiles.id = events.user_id
  where events.status = 'succeeded'
    and events.period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
  group by events.user_id, profiles.email
  order by consumed_units desc, profiles.email
  limit least(greatest(p_limit, 1), 50);
$$;

create or replace function public.admin_member_usage(p_user_ids uuid[])
returns table (
  user_id uuid,
  consumed_units bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select events.user_id, sum(events.consumed_units)::bigint as consumed_units
  from public.generation_events events
  where events.user_id = any(p_user_ids)
    and events.status = 'succeeded'
    and events.period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
  group by events.user_id;
$$;

revoke all on function public.reserve_generation(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.finalize_generation(uuid, uuid, boolean, integer, text) from public, anon, authenticated;
revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;
revoke all on function public.admin_usage_summary() from public, anon, authenticated;
revoke all on function public.member_usage_summary(uuid) from public, anon, authenticated;
revoke all on function public.admin_usage_daily(integer) from public, anon, authenticated;
revoke all on function public.admin_usage_top(integer) from public, anon, authenticated;
revoke all on function public.admin_member_usage(uuid[]) from public, anon, authenticated;
grant execute on function public.reserve_generation(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.finalize_generation(uuid, uuid, boolean, integer, text) to service_role;
grant execute on function public.admin_usage_summary() to service_role;
grant execute on function public.member_usage_summary(uuid) to service_role;
grant execute on function public.admin_usage_daily(integer) to service_role;
grant execute on function public.admin_usage_top(integer) to service_role;
grant execute on function public.admin_member_usage(uuid[]) to service_role;

comment on table public.profiles is 'Membership and approval state. Drafts remain browser-local in v1.';
comment on table public.generation_events is 'Server-only AI usage reservations and successful image credit ledger.';
