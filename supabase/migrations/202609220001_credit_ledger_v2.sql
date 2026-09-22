-- Image-credit wallet. Additive and inactive until an administrator explicitly migrates an account.
-- No automatic conversion of existing monthly_quota or of paid rights.

create table if not exists public.credit_accounts (
  user_id uuid primary key references public.profiles(id),
  pricing_policy text not null default 'image-v2' check (pricing_policy = 'image-v2'),
  activated_at timestamptz not null default now(),
  opening_period date not null,
  opening_used_units integer not null default 0 check (opening_used_units >= 0),
  legacy_snapshot jsonb not null,
  conversion_ratio numeric not null check (conversion_ratio > 0)
);
create table if not exists public.subscription_plans (
  id text primary key, name text not null,
  monthly_units integer not null check (monthly_units between 0 and 1000000),
  price_krw integer not null check (price_krw >= 0),
  active boolean not null default false, updated_at timestamptz not null default now()
);
create table if not exists public.user_subscriptions (
  user_id uuid primary key references public.profiles(id),
  plan_id text not null references public.subscription_plans(id),
  status text not null check (status in ('active','canceled','suspended')),
  started_at timestamptz not null, cancel_at timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.subscription_periods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  period date not null, starts_at timestamptz not null, expires_at timestamptz not null,
  plan_id text not null references public.subscription_plans(id),
  units integer not null check (units > 0), paid_amount_krw integer not null check (paid_amount_krw >= 0),
  source_key text not null unique, confirmed_by uuid not null references public.profiles(id),
  confirmed_at timestamptz not null default now(),
  unique(user_id, period), check (expires_at > starts_at)
);
create table if not exists public.credit_grants (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('subscription','purchase','bonus')),
  granted_units integer not null check (granted_units > 0),
  consumed_units integer not null default 0 check (consumed_units >= 0),
  reserved_units integer not null default 0 check (reserved_units >= 0),
  granted_at timestamptz not null default now(), expires_at timestamptz not null,
  period date, period_id uuid references public.subscription_periods(id),
  source_key text not null unique, paid_amount_krw integer not null default 0 check (paid_amount_krw >= 0),
  granted_by uuid references public.profiles(id), reason text not null,
  revoked_at timestamptz, revoked_reason text, revoked_by uuid references public.profiles(id),
  unique(id,user_id), check (consumed_units + reserved_units <= granted_units),
  check (expires_at > granted_at), check (kind <> 'subscription' or period is not null)
);
create unique index if not exists credit_grants_paid_period_idx on public.credit_grants(period_id) where period_id is not null;
create index if not exists credit_grants_live_idx on public.credit_grants(user_id, expires_at, id) where revoked_at is null;
-- credit_wallet_state reads every lot a member holds, revoked ones included, so the partial index
-- above cannot serve it. Without this the wallet scans the whole table -- inside the global lock.
create index if not exists credit_grants_user_idx on public.credit_grants(user_id, expires_at);
alter table public.generation_events add column if not exists pricing_policy text not null default 'cost-v1';
alter table public.generation_events add column if not exists credit_quote jsonb;
alter table public.generation_events add column if not exists credit_phase text;
create table if not exists public.credit_holds (
  user_id uuid not null, request_id uuid not null, grant_id uuid not null,
  units integer not null check (units > 0),
  consumed_units integer not null default 0 check (consumed_units >= 0),
  released_units integer not null default 0 check (released_units >= 0),
  primary key(user_id,request_id,grant_id),
  foreign key(user_id,request_id) references public.generation_events(user_id,request_id),
  foreign key(grant_id,user_id) references public.credit_grants(id,user_id),
  check (consumed_units + released_units <= units)
);
create table if not exists public.credit_consumptions (
  user_id uuid not null, request_id uuid not null, grant_id uuid not null,
  units integer not null check (units > 0), created_at timestamptz not null default now(),
  primary key(user_id,request_id,grant_id),
  foreign key(user_id,request_id,grant_id) references public.credit_holds(user_id,request_id,grant_id)
);
create table if not exists public.credit_jobs (
  user_id uuid not null, request_id uuid not null, job_key text not null,
  resource_key text not null, provider_request_id text not null, endpoint text not null,
  primary key(user_id,job_key),
  foreign key(user_id,request_id) references public.generation_events(user_id,request_id)
);
create table if not exists public.credit_admin_events (
  id uuid primary key, actor_id uuid not null references public.profiles(id),
  action text not null, target_ids uuid[] not null, reason text not null,
  input jsonb not null, result jsonb, created_at timestamptz not null default now()
);
-- The audit trail grows with operator actions, not with member count, and is never pruned.
-- Opening one member's history scans all of it without this. The lookup must use the containment
-- operator: `scalar = any(array column)` never reaches a GIN index, so an index that merely
-- exists is a write cost with no read gain (measured: seq 5.4ms vs index 0.09ms at 50k rows).
create index if not exists credit_admin_events_targets_idx on public.credit_admin_events using gin(target_ids);
alter table public.teams add column if not exists credit_policy text not null default 'cost-v1';
alter table public.teams add column if not exists credit_opening_period date;
alter table public.teams add column if not exists credit_opening_used integer not null default 0;

-- All financial writes acquire this short transaction mutex FIRST. Never hold it across an API call.
create or replace function public.credit_lock() returns void language sql volatile security definer set search_path=public
as $$ select pg_advisory_xact_lock(922202601::bigint) $$;
create or replace function public.credit_require_admin(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and email_confirmed_at is not null) then
    raise exception 'credit_admin_required';
  end if;
end $$;
create or replace function public.credit_purchase_expiry(p_at timestamptz) returns timestamptz language sql stable set search_path=public
as $$ select ((p_at at time zone 'Asia/Seoul') + interval '3 months') at time zone 'Asia/Seoul' $$;
create or replace function public.credit_period_start() returns date language sql stable
as $$ select date_trunc('month',now() at time zone 'Asia/Seoul')::date $$;

create or replace function public.credit_ensure_paid_period(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.credit_lock();
  if not exists(select 1 from credit_accounts where user_id=p_user) then return; end if;
  insert into credit_grants(user_id,kind,granted_units,granted_at,expires_at,period,period_id,source_key,paid_amount_krw,granted_by,reason)
    select p.user_id,'subscription',p.units,p.starts_at,p.expires_at,p.period,p.id,'paid-period:'||p.id,p.paid_amount_krw,p.confirmed_by,'확인된 구독 기간 지급'
    from subscription_periods p where p.user_id=p_user and p.starts_at<=now() and p.expires_at>now()
    on conflict(source_key) do nothing;
end $$;

create or replace function public.credit_wallet_state(p_user uuid) returns jsonb language sql stable security definer set search_path=public as $$
with lots as (
  select *, case when revoked_at is null and expires_at>now() then granted_units-consumed_units-reserved_units else 0 end as available
  from credit_grants where user_id=p_user
), sums as (
  select coalesce(sum(available),0)::integer as available,
    coalesce(sum(reserved_units),0)::integer as reserved,
    coalesce(sum(available) filter(where kind='subscription'),0)::integer as subscription_units,
    coalesce(sum(available) filter(where kind='purchase'),0)::integer as purchase_units,
    coalesce(sum(available) filter(where kind='bonus'),0)::integer as bonus_units,
    min(expires_at) filter(where available>0 and kind='subscription') as subscription_expires,
    min(expires_at) filter(where available>0 and kind='purchase') as purchase_expires,
    min(expires_at) filter(where available>0 and kind='bonus') as bonus_expires
  from lots
), used as (
  select coalesce(sum(consumed_units),0)::integer as amount from generation_events
  where user_id=p_user and pricing_policy='image-v2' and status='succeeded' and period_start=credit_period_start()
)
select jsonb_build_object('pricing_policy','image-v2','balance',s.available+s.reserved,'available',s.available,'reserved',s.reserved,
  'used',u.amount+case when a.opening_period=credit_period_start() then a.opening_used_units else 0 end,
  'subscription_units',s.subscription_units,'purchase_units',s.purchase_units,'bonus_units',s.bonus_units,
  'subscription_expires_at',s.subscription_expires,'purchase_expires_at',s.purchase_expires,'bonus_expires_at',s.bonus_expires,
  'period_start',credit_period_start(),'period_end',(credit_period_start()+interval '1 month')::date)
from sums s cross join used u join credit_accounts a on a.user_id=p_user;
$$;

create or replace function public.credit_summary(p_user uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform public.credit_lock();
  perform public.credit_ensure_paid_period(p_user);
  return public.credit_wallet_state(p_user);
end $$;

create or replace function public.credit_admin_grant(p_user uuid,p_kind text,p_units integer,p_paid_krw integer,p_expires timestamptz,p_source text,p_reason text,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_existing credit_grants%rowtype; v_expiry timestamptz; v_period date;
begin
  perform public.credit_lock(); perform public.credit_require_admin(p_actor);
  if not exists(select 1 from credit_accounts where user_id=p_user) then raise exception 'credit_account_not_activated'; end if;
  if p_kind not in ('subscription','purchase','bonus') or p_units is null or p_units not between 1 and 1000000 or p_paid_krw is null or p_paid_krw<0 or length(trim(coalesce(p_reason,'')))=0 or length(trim(coalesce(p_source,'')))=0 then raise exception 'invalid_credit_grant'; end if;
  select * into v_existing from credit_grants where source_key=p_source;
  if found then
    if v_existing.user_id<>p_user or v_existing.kind<>p_kind or v_existing.granted_units<>p_units or v_existing.paid_amount_krw<>p_paid_krw then raise exception 'credit_source_conflict'; end if;
    return v_existing.id;
  end if;
  v_expiry := case when p_kind='purchase' then credit_purchase_expiry(now()) when p_kind='subscription' then ((credit_period_start()+interval '1 month')::timestamp at time zone 'Asia/Seoul') else p_expires end;
  if v_expiry is null or v_expiry<=now() or not isfinite(v_expiry) then raise exception 'invalid_credit_expiry'; end if;
  v_period := case when p_kind='subscription' then credit_period_start() else null end;
  insert into credit_grants(user_id,kind,granted_units,expires_at,period,source_key,paid_amount_krw,granted_by,reason)
    values(p_user,p_kind,p_units,v_expiry,v_period,p_source,p_paid_krw,p_actor,p_reason) returning id into v_id;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input,result)
    values(v_id,p_actor,'grant',array[p_user],p_reason,jsonb_build_object('kind',p_kind,'units',p_units,'paid_krw',p_paid_krw,'source',p_source),jsonb_build_object('grant_id',v_id));
  return v_id;
end $$;

create or replace function public.credit_admin_revoke(p_grant uuid,p_reason text,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare g credit_grants%rowtype;
begin
  perform public.credit_lock(); perform public.credit_require_admin(p_actor);
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'credit_reason_required'; end if;
  select * into g from credit_grants where id=p_grant for update;
  if not found then raise exception 'credit_grant_not_found'; end if;
  if g.reserved_units>0 then raise exception 'credit_grant_has_holds'; end if;
  if g.revoked_at is not null then return credit_wallet_state(g.user_id); end if;
  update credit_grants set revoked_at=now(),revoked_reason=p_reason,revoked_by=p_actor where id=p_grant;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input,result)
    values(gen_random_uuid(),p_actor,'revoke',array[g.user_id],p_reason,jsonb_build_object('grant_id',p_grant),jsonb_build_object('unused',g.granted_units-g.consumed_units));
  return credit_wallet_state(g.user_id);
end $$;

create or replace function public.credit_admin_plan(p_id text,p_name text,p_units integer,p_price integer,p_active boolean,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if length(trim(coalesce(p_id,'')))=0 or length(trim(coalesce(p_name,'')))=0 or p_units is null or p_units not between 0 and 1000000 or p_price is null or p_price<0 then raise exception 'invalid_credit_plan'; end if;
  insert into subscription_plans(id,name,monthly_units,price_krw,active) values(p_id,p_name,p_units,p_price,p_active)
  on conflict(id) do update set name=excluded.name,monthly_units=excluded.monthly_units,price_krw=excluded.price_krw,active=excluded.active,updated_at=now();
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input) values(gen_random_uuid(),p_actor,'plan',array[]::uuid[],'플랜 설정 변경',jsonb_build_object('id',p_id,'name',p_name,'units',p_units,'price',p_price,'active',p_active));
end $$;

create or replace function public.credit_admin_subscription(p_user uuid,p_plan text,p_status text,p_started timestamptz,p_cancel timestamptz,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if not exists(select 1 from credit_accounts where user_id=p_user) then raise exception 'credit_account_not_activated'; end if;
  if p_status not in ('active','canceled','suspended') or p_started is null then raise exception 'invalid_subscription'; end if;
  if not exists(select 1 from subscription_plans where id=p_plan and (active or p_status<>'active')) then raise exception 'inactive_subscription_plan'; end if;
  insert into user_subscriptions(user_id,plan_id,status,started_at,cancel_at) values(p_user,p_plan,p_status,p_started,p_cancel)
  on conflict(user_id) do update set plan_id=excluded.plan_id,status=excluded.status,started_at=excluded.started_at,cancel_at=excluded.cancel_at,updated_at=now();
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input) values(gen_random_uuid(),p_actor,'subscription',array[p_user],'구독 설정 변경',jsonb_build_object('plan',p_plan,'status',p_status,'started_at',p_started,'cancel_at',p_cancel));
end $$;

-- Assigning a plan to a selection is one transaction: a member the ledger cannot accept rolls the
-- whole thing back instead of leaving half the list on the new plan and half on the old one.
--
-- **A retry must not run twice.** The screen has a "retry the same request" button and the caller
-- sends a fresh `started_at` each time; running twice would stack duplicate audit rows and push
-- `started_at` forward, which `credit_admin_confirm_period` reads through `greatest(...)` -- a later
-- start can then refuse a paid period that is genuinely inside the subscription.
create or replace function public.credit_admin_subscription_many(p_users uuid[],p_plan text,p_status text,p_started timestamptz,p_cancel timestamptz,p_actor uuid,p_action uuid)
returns void language plpgsql security definer set search_path=public as $$
declare u uuid; v_old credit_admin_events%rowtype;
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if p_users is null or cardinality(p_users) not between 1 and 200 or p_action is null then raise exception 'invalid_subscription'; end if;
  select * into v_old from credit_admin_events where id=p_action;
  if found then
    if v_old.actor_id<>p_actor or v_old.input<>jsonb_build_object('users',p_users,'plan',p_plan,'status',p_status) then raise exception 'credit_source_conflict'; end if;
    return;
  end if;
  foreach u in array p_users loop perform credit_admin_subscription(u,p_plan,p_status,p_started,p_cancel,p_actor); end loop;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input)
    values(p_action,p_actor,'subscription_bulk',p_users,'구독 일괄 설정',jsonb_build_object('users',p_users,'plan',p_plan,'status',p_status));
end $$;

-- Approving and suspending in bulk. The transitions are the union of what two single-member actions
-- do today (apps/web/app/admin/actions.ts): `setMemberStatus` moves active<->suspended, and
-- `approveMember` moves pending->active. Both require a confirmed email to become active.
--
-- `approveMember` also stamps approved_at/approved_by, so this does too. Leaving them blank would
-- put the credit audit trail and the profiles table into two different stories about who approved
-- whom, and the member list reads the profiles one.
--
-- **Members that do not match are skipped, not rejected.** Picking twenty rows and having the whole
-- batch refused because one of them is already suspended makes the feature unusable; the returned
-- list says exactly who moved.
--
-- **No approval mail is sent here.** The single-member path sends one and records
-- approval_notified_at; doing that for a whole selection inside one request is a timeout waiting to
-- happen. /admin keeps a per-member resend button, and the screen says so.
create or replace function public.credit_admin_member_status(p_users uuid[],p_status text,p_reason text,p_actor uuid,p_action uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old credit_admin_events%rowtype; v_changed uuid[];
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if p_status not in ('active','suspended') or p_users is null or cardinality(p_users) not between 1 and 200
     or p_action is null or length(trim(coalesce(p_reason,'')))=0 then raise exception 'invalid_member_status'; end if;
  select * into v_old from credit_admin_events where id=p_action;
  if found then
    if v_old.actor_id<>p_actor or v_old.input<>jsonb_build_object('users',p_users,'status',p_status) then raise exception 'credit_source_conflict'; end if;
    return v_old.result;
  end if;
  if p_status='suspended' and p_actor=any(p_users) then raise exception 'cannot_suspend_self'; end if;
  with moved as (
    update profiles set status=p_status,updated_at=now(),
      approved_at=case when p_status='active' and approved_at is null then now() else approved_at end,
      approved_by=case when p_status='active' and approved_at is null then p_actor else approved_by end
     where id=any(p_users)
       and ((p_status='suspended' and status='active')
         or (p_status='active' and status in('pending','suspended') and email_confirmed_at is not null))
    returning id
  ) select coalesce(array_agg(id),'{}'::uuid[]) into v_changed from moved;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input,result)
    values(p_action,p_actor,'status',p_users,p_reason,jsonb_build_object('users',p_users,'status',p_status),to_jsonb(v_changed));
  return to_jsonb(v_changed);
end $$;

create or replace function public.credit_admin_confirm_period(p_user uuid,p_period date,p_paid integer,p_units integer,p_source text,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare s user_subscriptions%rowtype; v_existing subscription_periods%rowtype; v_id uuid; v_from timestamptz; v_until timestamptz;
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if p_period is null or p_period<>date_trunc('month',p_period)::date or p_paid is null or p_paid<0 or p_units is null or p_units not between 1 and 1000000 or length(trim(coalesce(p_source,'')))=0 then raise exception 'invalid_paid_period'; end if;
  select * into v_existing from subscription_periods where source_key=p_source;
  if found then
    if v_existing.user_id<>p_user or v_existing.period<>p_period or v_existing.units<>p_units or v_existing.paid_amount_krw<>p_paid then raise exception 'credit_source_conflict'; end if;
    return v_existing.id;
  end if;
  select * into s from user_subscriptions where user_id=p_user and status='active';
  if not found then raise exception 'active_subscription_required'; end if;
  v_from:=greatest(p_period::timestamp at time zone 'Asia/Seoul',s.started_at);
  v_until:=(p_period+interval '1 month')::timestamp at time zone 'Asia/Seoul';
  if v_from>=v_until or (s.cancel_at is not null and v_from>=s.cancel_at) then raise exception 'outside_subscription_period'; end if;
  insert into subscription_periods(user_id,period,starts_at,expires_at,plan_id,units,paid_amount_krw,source_key,confirmed_by)
    values(p_user,p_period,v_from,v_until,s.plan_id,p_units,p_paid,p_source,p_actor) returning id into v_id;
  perform credit_ensure_paid_period(p_user);
  return v_id;
end $$;

-- The conversion is an explicit, audited operation; no default ratio and no implicit activation.
create or replace function public.credit_admin_activate(p_users uuid[],p_ratio numeric,p_reason text,p_actor uuid,p_action uuid,p_reviewed_legacy boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; v_used integer; v_remaining integer; v_open integer; v_team uuid; v_team_quota integer; v_team_new integer; v_old credit_admin_events%rowtype; v_result jsonb:='[]';
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  -- The loop below runs inside one transaction that holds the global credit lock, so this cap is
  -- the length of a service-wide pause: every member's generation and wallet read waits on it.
  -- Conversion must stay atomic per team, so the batch cannot be split inside the function --
  -- the caller splits instead. Raise this only for a single team larger than the cap, knowing
  -- what the pause costs.
  if p_ratio is null or p_ratio<=0 or p_users is null or cardinality(p_users) not between 1 and 50 or p_action is null or length(trim(coalesce(p_reason,'')))=0 then raise exception 'invalid_credit_conversion'; end if;
  select * into v_old from credit_admin_events where id=p_action;
  if found then
    if v_old.actor_id<>p_actor or v_old.input<>jsonb_build_object('users',p_users,'ratio',p_ratio) then raise exception 'credit_source_conflict'; end if;
    return v_old.result;
  end if;
  if exists(select 1 from generation_events where user_id=any(p_users) and status='reserved') then raise exception 'legacy_reservations_must_settle'; end if;
  if not coalesce(p_reviewed_legacy,false) and exists(select 1 from generation_events where user_id=any(p_users) and error_code='reservation_expired') then raise exception 'legacy_expired_jobs_need_review'; end if;
  if (select count(*) from profiles where id=any(p_users)) <> cardinality(p_users) then raise exception 'invalid_or_duplicate_users'; end if;
  if exists(select 1 from credit_accounts where user_id=any(p_users)) then raise exception 'credit_account_already_activated'; end if;
  if exists(select 1 from team_members tm where tm.team_id in(select team_id from team_members where user_id=any(p_users)) and not(tm.user_id=any(p_users))) then raise exception 'migrate_all_team_members_together'; end if;
  if exists(select 1 from teams where id in(select team_id from team_members where user_id=any(p_users)) and monthly_quota>0 and floor(monthly_quota/p_ratio)=0) then raise exception 'team_conversion_would_remove_limit'; end if;
  for p in select * from profiles where id=any(p_users) order by id for update loop
    select coalesce(sum(consumed_units),0)::integer into v_used from generation_events where user_id=p.id and status='succeeded' and period_start=credit_period_start();
    v_remaining:=floor(greatest(0,p.monthly_quota-v_used)/p_ratio)::integer; v_open:=ceil(v_used/p_ratio)::integer;
    insert into credit_accounts(user_id,opening_period,opening_used_units,legacy_snapshot,conversion_ratio)
      values(p.id,credit_period_start(),v_open,jsonb_build_object('quota',p.monthly_quota,'used',v_used,'remaining',greatest(0,p.monthly_quota-v_used),'actor',p_actor,'reason',p_reason),p_ratio);
    if v_remaining>0 then perform credit_admin_grant(p.id,'bonus',v_remaining,0,credit_purchase_expiry(now()),'migration:'||p_action||':'||p.id,p_reason,p_actor); end if;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('user_id',p.id,'legacy_quota',p.monthly_quota,'legacy_used',v_used,'granted_units',v_remaining));
  end loop;
  -- A team limit is overwritten in place and floor() drops the remainder, so the original cannot be
  -- recovered from the converted value. Members keep theirs in credit_accounts.legacy_snapshot; the
  -- team has no such row, so the audit event is the only place it can survive. Record it here or lose it.
  for v_team in select distinct team_id from team_members where user_id=any(p_users) loop
    select coalesce(sum(consumed_units),0)::integer into v_used from generation_events where team_id=v_team and status='succeeded' and period_start=credit_period_start();
    select monthly_quota into v_team_quota from teams where id=v_team;
    v_team_new:=case when v_team_quota=0 then 0 else floor(v_team_quota/p_ratio)::integer end;
    update teams set monthly_quota=v_team_new,
      credit_policy='image-v2',credit_opening_period=credit_period_start(),credit_opening_used=ceil(v_used/p_ratio)::integer where id=v_team;
    v_result:=v_result||jsonb_build_array(jsonb_build_object('team_id',v_team,'legacy_quota',v_team_quota,'legacy_used',v_used,'quota',v_team_new));
  end loop;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input,result) values(p_action,p_actor,'activate',p_users,p_reason,jsonb_build_object('users',p_users,'ratio',p_ratio),v_result);
  return v_result;
end $$;

create or replace function public.credit_reserve(p_user uuid,p_request uuid,p_operation text,p_outputs integer[],p_resource text,p_analysis_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; g credit_grants%rowtype; v_need integer; v_left integer; v_take integer; v_team uuid; v_cap integer; v_team_used integer; v_state jsonb;
  v_analysis_limit integer := least(greatest(p_analysis_limit,1),1000); v_recent integer;
  -- 모델이 일한 흔적이 없는 실패. 202609200002 의 목록과 같아야 한다.
  v_exempt_codes text[] := array['AI_KEY_MISSING','AI_KEY_INVALID','AI_MODEL_ACCESS_DENIED','AI_QUOTA_EXCEEDED','AI_PROVIDER_UNAVAILABLE','INVALID_IMAGE_PAYLOAD','reservation_expired'];
begin
  perform credit_lock();
  select * into p from profiles where id=p_user for update;
  if not found or p.status<>'active' or p.email_confirmed_at is null then return jsonb_build_object('allowed',false,'reason','inactive_member'); end if;
  if not exists(select 1 from credit_accounts where user_id=p_user) then return jsonb_build_object('allowed',false,'reason','credit_account_not_activated'); end if;
  if p_request is null or p_operation not in ('pdp_analyze','reference_analyze','redesign_transcribe','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image','ad_export') or p_outputs is null or cardinality(p_outputs)>60 or exists(select 1 from unnest(p_outputs) u where u is null or u not in(1,2)) or length(trim(coalesce(p_resource,'')))=0 then raise exception 'invalid_credit_quote'; end if;
  select coalesce(sum(u),0)::integer into v_need from unnest(p_outputs) u;
  if v_need>max_reserve_units() then return jsonb_build_object('allowed',false,'reason','invalid_request'); end if;
  perform credit_ensure_paid_period(p_user); v_state:=credit_wallet_state(p_user);
  if exists(select 1 from generation_events where user_id=p_user and request_id=p_request) then return jsonb_build_object('allowed',false,'reason','duplicate_request','usage',v_state); end if;
  -- Holding credits and blocking the member are different decisions. A hold survives expiry and
  -- settlement review by design; the block must not, or an abandoned request locks the account
  -- until an administrator notices. Only a live, unreviewed request blocks the next one.
  if v_need>0 and exists(select 1 from generation_events where user_id=p_user and pricing_policy='image-v2' and status='reserved' and requested_units>0 and expires_at>now() and credit_phase is distinct from 'needs_review') then return jsonb_build_object('allowed',false,'reason','concurrent_limit','usage',v_state); end if;
  /*
    **시간당 한도는 작업 종류별로 센다.** 한도 값은 앱이 넣어 준다
    (`lib/membership/hourly-limit.ts`). 옛 경로와 같은 계약이라야 한다 — 정책
    스위치 하나로 회원이 다른 한도를 받으면 안 된다(202609200002).
  */
  if p_operation in ('pdp_analyze','reference_analyze','redesign_transcribe') then
    -- 값이 나간 시도만 센다. 아직 안 닫힌 행(error_code is null)은 센다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour'
        and coalesce(error_code,'') <> all (v_exempt_codes);
    if v_recent>=v_analysis_limit then return jsonb_build_object('allowed',false,'reason','analysis_rate_limit','usage',v_state); end if;
    -- 남용 천장. 면제받은 실패도 서버를 쓴다. 정상 사용은 여기 닿지 않는다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour';
    if v_recent>=v_analysis_limit*10 then return jsonb_build_object('allowed',false,'reason','analysis_abuse_limit','usage',v_state); end if;
  end if;
  if (v_state->>'available')::integer<v_need then return jsonb_build_object('allowed',false,'reason','quota_exceeded','usage',v_state); end if;
  select tm.team_id into v_team from team_members tm where tm.user_id=p_user;
  if v_team is not null then
    select monthly_quota into v_cap from teams where id=v_team and deleted_at is null;
    if v_cap>0 then
      select coalesce(sum(case when status='succeeded' then consumed_units when status='reserved' then requested_units else 0 end),0)::integer into v_team_used
        from generation_events where team_id=v_team and pricing_policy='image-v2' and period_start=credit_period_start();
      v_team_used:=v_team_used+coalesce((select case when credit_opening_period=credit_period_start() then credit_opening_used else 0 end from teams where id=v_team),0);
      if v_team_used+v_need>v_cap then return jsonb_build_object('allowed',false,'reason','team_quota_exceeded','usage',v_state); end if;
    end if;
  end if;
  insert into generation_events(user_id,request_id,operation,period_start,requested_units,expires_at,team_id,pricing_policy,credit_quote,credit_phase)
    values(p_user,p_request,p_operation,credit_period_start(),v_need,now()+interval '10 minutes',v_team,'image-v2',jsonb_build_object('policy','image-v2','version','2026-09-22.1','outputs',to_jsonb(p_outputs),'resource',p_resource),'reserved');
  v_left:=v_need;
  for g in select * from credit_grants where user_id=p_user and revoked_at is null and expires_at>now() and granted_units-consumed_units-reserved_units>0 order by expires_at,granted_at,id for update loop
    exit when v_left=0;
    v_take:=least(v_left,g.granted_units-g.consumed_units-g.reserved_units);
    update credit_grants set reserved_units=reserved_units+v_take where id=g.id;
    insert into credit_holds(user_id,request_id,grant_id,units) values(p_user,p_request,g.id,v_take);
    v_left:=v_left-v_take;
  end loop;
  if v_left<>0 then raise exception 'credit_reservation_invariant'; end if;
  return jsonb_build_object('allowed',true,'reason','ok','usage',credit_wallet_state(p_user),'policy','image-v2');
end $$;

create or replace function public.credit_mark_started(p_user uuid,p_request uuid) returns void language plpgsql security definer set search_path=public as $$
declare e generation_events%rowtype;
begin
  perform credit_lock();
  select * into e from generation_events where user_id=p_user and request_id=p_request for update;
  if not found then raise exception 'credit_reservation_not_startable'; end if;
  if e.pricing_policy<>'image-v2' then return; end if;
  if e.status<>'reserved' or e.credit_phase is distinct from 'reserved' then raise exception 'credit_reservation_not_startable'; end if;
  update generation_events set credit_phase='started' where user_id=p_user and request_id=p_request and pricing_policy='image-v2' and status='reserved' and credit_phase='reserved';
end $$;

create or replace function public.credit_bind_job(p_user uuid,p_request uuid,p_job text,p_resource text,p_provider text,p_endpoint text)
returns void language plpgsql security definer set search_path=public as $$
declare e generation_events%rowtype; j credit_jobs%rowtype;
begin
  perform credit_lock(); select * into e from generation_events where user_id=p_user and request_id=p_request for update;
  if not found or e.pricing_policy<>'image-v2' or e.status<>'reserved' or e.credit_quote->>'resource'<>p_resource then raise exception 'credit_job_scope_mismatch'; end if;
  select * into j from credit_jobs where user_id=p_user and job_key=p_job;
  if found then
    if j.request_id<>p_request or j.resource_key<>p_resource or j.provider_request_id<>p_provider or j.endpoint<>p_endpoint then raise exception 'credit_job_binding_conflict'; end if;
    return;
  end if;
  insert into credit_jobs values(p_user,p_request,p_job,p_resource,p_provider,p_endpoint);
  update generation_events set credit_phase='submitted' where id=e.id;
end $$;

create or replace function public.credit_lookup_job(p_user uuid,p_job text) returns jsonb language sql stable security definer set search_path=public
as $$ select to_jsonb(j) from credit_jobs j where user_id=p_user and job_key=p_job $$;

create or replace function public.credit_close_poster(p_user uuid,p_project uuid,p_request uuid,p_status text,p_clear boolean)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock();
  if p_status not in ('done','ready') then raise exception 'invalid_credit_project_status'; end if;
  if not exists(select 1 from credit_jobs where user_id=p_user and request_id=p_request and resource_key='poster:'||p_project) then raise exception 'credit_job_binding_required'; end if;
  update poster_projects set status=p_status,data=case when p_clear then data-'reservationId' else data end,updated_at=now()
    where id=p_project and user_id=p_user and data->>'reservationId'=p_request::text;
  return found;
end $$;

create or replace function public.credit_finalize(p_user uuid,p_request uuid,p_successful_positions integer[],p_terminal boolean,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e generation_events%rowtype; h credit_holds%rowtype; v_units integer:=0; v_left integer; v_take integer; v_quote jsonb; v_pos integer;
begin
  perform credit_lock(); select * into e from generation_events where user_id=p_user and request_id=p_request for update;
  if not found or e.pricing_policy<>'image-v2' then raise exception 'credit_reservation_not_found'; end if;
  if e.status<>'reserved' then return jsonb_build_object('settled',true,'consumed_units',e.consumed_units,'usage',credit_wallet_state(p_user)); end if;
  if p_successful_positions is null then raise exception 'invalid_delivery_evidence'; end if;
  v_quote:=e.credit_quote->'outputs';
  if cardinality(p_successful_positions)<>(select count(distinct u) from unnest(p_successful_positions) u) then raise exception 'duplicate_delivery_position'; end if;
  foreach v_pos in array p_successful_positions loop
    if v_pos is null or v_pos<0 or v_pos>=jsonb_array_length(v_quote) then raise exception 'delivery_outside_quote'; end if;
    v_units:=v_units+(v_quote->>v_pos)::integer;
  end loop;
  if not p_terminal and e.credit_phase<>'reserved' then
    update generation_events set credit_phase='needs_review',error_code=coalesce(p_error,'completion_unknown') where id=e.id;
    return jsonb_build_object('settled',false,'reason','settlement_pending','usage',credit_wallet_state(p_user));
  end if;
  v_left:=v_units;
  for h in select ch.* from credit_holds ch join credit_grants cg on cg.id=ch.grant_id where ch.user_id=p_user and ch.request_id=p_request order by cg.expires_at,cg.granted_at,cg.id for update of ch loop
    v_take:=least(v_left,h.units);
    update credit_grants set reserved_units=reserved_units-h.units,consumed_units=consumed_units+v_take where id=h.grant_id;
    update credit_holds set consumed_units=v_take,released_units=units-v_take where user_id=h.user_id and request_id=h.request_id and grant_id=h.grant_id;
    if v_take>0 then insert into credit_consumptions(user_id,request_id,grant_id,units) values(p_user,p_request,h.grant_id,v_take); end if;
    v_left:=v_left-v_take;
  end loop;
  if v_left<>0 then raise exception 'credit_settlement_invariant'; end if;
  update generation_events set status=case when v_units>0 or cardinality(p_successful_positions)=0 and p_terminal and p_error is null then 'succeeded' else 'failed' end,
    consumed_units=v_units,completed_at=now(),credit_phase='settled',error_code=p_error where id=e.id;
  return jsonb_build_object('settled',true,'consumed_units',v_units,'usage',credit_wallet_state(p_user));
end $$;

create or replace function public.credit_admin_resolve(p_user uuid,p_request uuid,p_positions integer[],p_reason text,p_actor uuid,p_action uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_result jsonb; old credit_admin_events%rowtype;
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if p_action is null or length(trim(coalesce(p_reason,'')))=0 then raise exception 'credit_reason_required'; end if;
  select * into old from credit_admin_events where id=p_action;
  if found then
    if old.input<>jsonb_build_object('user',p_user,'request',p_request,'positions',p_positions) then raise exception 'credit_source_conflict'; end if;
    return old.result;
  end if;
  v_result:=credit_finalize(p_user,p_request,p_positions,true,case when cardinality(p_positions)=0 then 'admin_confirmed_no_delivery' else null end);
  insert into credit_admin_events values(p_action,p_actor,'resolve',array[p_user],p_reason,jsonb_build_object('user',p_user,'request',p_request,'positions',p_positions),v_result,now());
  return v_result;
end $$;

-- `p_review` finds members whose credits are held waiting for an operator to confirm a settlement.
-- Those holds no longer block the member, which is the point, but that also means nobody complains
-- any more -- a run of provider trouble can quietly lock a wallet with no one noticing.
create or replace function public.credit_admin_members(p_actor uuid,p_query text default '',p_status text default '',p_team uuid default null,p_balance text default '',p_expiring boolean default false,p_sort text default 'created',p_direction text default 'desc',p_limit integer default 50,p_offset integer default 0,p_plan text default '',p_review boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform credit_require_admin(p_actor);
  if p_sort not in ('created','email','balance','used','expires') or p_direction not in ('asc','desc') or p_limit not between 1 and 500 or p_offset<0 then raise exception 'invalid_member_query'; end if;
  with lots as (
    select user_id,
      coalesce(sum(granted_units-consumed_units-reserved_units) filter(where revoked_at is null and expires_at>now()),0)::integer available,
      coalesce(sum(reserved_units),0)::integer reserved,
      min(expires_at) filter(where revoked_at is null and expires_at>now() and granted_units-consumed_units-reserved_units>0) next_expires
    from credit_grants group by user_id
  ), pending as (
    select pp.user_id,sum(pp.units)::integer units,min(pp.expires_at) expires
    from subscription_periods pp left join credit_grants g on g.period_id=pp.id
    where g.id is null and pp.starts_at<=now() and pp.expires_at>now() group by pp.user_id
  ), review as (
    select user_id,coalesce(sum(requested_units),0)::integer units from generation_events
    where pricing_policy='image-v2' and status='reserved' and credit_phase='needs_review' group by user_id
  ), usage as (
    select user_id,pricing_policy,
      coalesce(sum(consumed_units) filter(where status='succeeded'),0)::integer used,
      coalesce(sum(requested_units) filter(where status='reserved' and (pricing_policy='image-v2' or expires_at>now())),0)::integer reserved
    from generation_events where period_start=credit_period_start() group by user_id,pricing_policy
  ), members as (
    select p.id,p.email,p.role,p.status,p.created_at,p.monthly_quota,tm.team_id,t.name team_name,
      case when a.user_id is null then 'cost-v1' else 'image-v2' end pricing_policy,
      case when a.user_id is null then greatest(0,p.monthly_quota-coalesce(u.used,0)-coalesce(u.reserved,0)) else coalesce(l.available,0)+coalesce(pg.units,0) end available,
      case when a.user_id is null then coalesce(u.reserved,0) else coalesce(l.reserved,0) end reserved,
      coalesce(u.used,0)+case when a.opening_period=credit_period_start() then a.opening_used_units else 0 end used,
      least(l.next_expires,pg.expires) next_expires,s.plan_id,s.status subscription_status,coalesce(rv.units,0) review_units
    from profiles p left join credit_accounts a on a.user_id=p.id
    left join usage u on u.user_id=p.id and u.pricing_policy=case when a.user_id is null then 'cost-v1' else 'image-v2' end
    left join lots l on l.user_id=p.id left join pending pg on pg.user_id=p.id left join review rv on rv.user_id=p.id
    left join team_members tm on tm.user_id=p.id left join teams t on t.id=tm.team_id
    left join user_subscriptions s on s.user_id=p.id
    where (p_query='' or p.email ilike '%'||p_query||'%') and (p_status='' or p.status=p_status) and (p_team is null or tm.team_id=p_team) and (p_plan='' or s.plan_id=p_plan)
  ), filtered as (
    select * from members where
      (p_balance='' or (p_balance='zero' and available=0) or (p_balance='low' and available between 1 and 10) or (p_balance='enough' and available>10))
      and (not p_expiring or next_expires<=now()+interval '7 days')
      and (not p_review or review_units>0)
  ), selected as (
    select * from filtered order by
      case when p_sort='created' and p_direction='asc' then created_at end asc,
      case when p_sort='created' and p_direction='desc' then created_at end desc,
      case when p_sort='email' and p_direction='asc' then email end asc,
      case when p_sort='email' and p_direction='desc' then email end desc,
      case when p_sort='balance' and p_direction='asc' then available end asc,
      case when p_sort='balance' and p_direction='desc' then available end desc,
      case when p_sort='used' and p_direction='asc' then used end asc,
      case when p_sort='used' and p_direction='desc' then used end desc,
      case when p_sort='expires' and p_direction='asc' then next_expires end asc nulls last,
      case when p_sort='expires' and p_direction='desc' then next_expires end desc nulls last,id
    limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce(jsonb_agg(to_jsonb(selected)),'[]'::jsonb)) into result from selected;
  return result;
end $$;

create or replace function public.credit_admin_history(p_actor uuid,p_user uuid,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform credit_require_admin(p_actor);
  select jsonb_build_object(
    'grants',coalesce((select jsonb_agg(to_jsonb(g)) from(select * from credit_grants where user_id=p_user order by granted_at desc,id limit least(greatest(p_limit,1),200))g),'[]'::jsonb),
    'pending',coalesce((select jsonb_agg(to_jsonb(e)) from(select request_id,operation,requested_units,credit_quote,credit_phase,created_at,error_code from generation_events where user_id=p_user and pricing_policy='image-v2' and status='reserved' order by created_at)e),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(a)) from(select * from credit_admin_events where target_ids @> array[p_user] order by created_at desc limit least(greatest(p_limit,1),200))a),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.credit_admin_grant_many(p_users uuid[],p_kind text,p_units integer,p_paid_krw integer,p_expires timestamptz,p_source text,p_reason text,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if coalesce(array_length(p_users,1),0) not between 1 and 200 or array_length(p_users,1)<>(select count(distinct x) from unnest(p_users)x) then raise exception 'invalid_grant_targets'; end if;
  foreach target in array p_users loop
    perform credit_admin_grant(target,p_kind,p_units,p_paid_krw,p_expires,p_source||':'||target,p_reason,p_actor);
  end loop;
end $$;

create or replace function public.credit_team_state(p_team uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t teams%rowtype; member_id uuid; result jsonb; total integer;
begin
  perform credit_lock(); select * into t from teams where id=p_team;
  if t.credit_policy is distinct from 'image-v2' then return null; end if;
  for member_id in select user_id from team_members where team_id=p_team loop perform credit_ensure_paid_period(member_id); end loop;
  select coalesce(sum(case when status='succeeded' then consumed_units when status='reserved' then requested_units else 0 end),0)::integer into total
    from generation_events where team_id=p_team and period_start=credit_period_start() and pricing_policy='image-v2';
  total:=total+case when t.credit_opening_period=credit_period_start() then t.credit_opening_used else 0 end;
  select jsonb_build_object('quota',t.monthly_quota,'teamUsed',total,'members',coalesce(jsonb_agg(jsonb_build_object(
    'userId',tm.user_id,'email',p.email,'role',tm.role,'used',(w.data->>'used')::integer+(w.data->>'reserved')::integer,
    'usedInTeam',coalesce((select sum(case when e.status='succeeded' then e.consumed_units when e.status='reserved' then e.requested_units else 0 end) from generation_events e where e.team_id=p_team and e.user_id=tm.user_id and e.period_start=credit_period_start() and e.pricing_policy='image-v2'),0),
    'personalQuota',(w.data->>'balance')::integer+(w.data->>'used')::integer)), '[]'::jsonb)) into result
    from team_members tm join profiles p on p.id=tm.user_id cross join lateral(select credit_wallet_state(tm.user_id) data)w where tm.team_id=p_team;
  return result;
end $$;

create or replace function public.credit_team_policy_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare expected text; actual text; cap integer;
begin
  if tg_op='UPDATE' and new.user_id=old.user_id and new.team_id=old.team_id then return new; end if;
  perform credit_lock();
  expected:=case when exists(select 1 from credit_accounts where user_id=new.user_id) then 'image-v2' else 'cost-v1' end;
  select credit_policy,monthly_quota into actual,cap from teams where id=new.team_id;
  if actual<>expected then
    if cap=0 and not exists(select 1 from team_members where team_id=new.team_id) and not exists(select 1 from generation_events where team_id=new.team_id) then
      update teams set credit_policy=expected where id=new.team_id;
    else raise exception 'team_credit_policy_mismatch'; end if;
  end if;
  return new;
end $$;
drop trigger if exists credit_team_policy_guard on public.team_members;
create trigger credit_team_policy_guard before insert or update on public.team_members for each row execute function public.credit_team_policy_guard();

create index if not exists generation_events_credit_period_idx on public.generation_events(period_start,pricing_policy,status,user_id);

-- The new columns are our internal pricing contract -- policy version, resolved output sizes and the
-- settlement phase. A member owns the row but has no reason to read the contract, and a table-wide
-- grant handed it over the moment the columns were added.
--
-- Re-granting an explicit list instead of revoking three names also fixes the shape of the mistake:
-- a column added later is hidden until someone decides to show it, rather than exposed by default.
--
-- **`force row level security` is deliberately not set here.** These tables already revoke every
-- privilege from `public`, `anon` and `authenticated`, so the only roles left are `service_role` and
-- the owner -- both trusted. Forcing RLS with no policies would instead lock the owner out of its own
-- ledger, including the Supabase SQL editor an operator needs when a settlement has to be unpicked
-- by hand. It buys nothing here and takes away the recovery path.
revoke select on public.generation_events from authenticated;
grant select (id,user_id,request_id,operation,period_start,requested_units,consumed_units,status,
  error_code,expires_at,completed_at,created_at,team_id,model,billable_images,llm_usd)
  on public.generation_events to authenticated;

-- Browser roles cannot mutate execution data or wallet evidence directly.
do $$ declare t text; f regprocedure; begin
  foreach t in array array['credit_accounts','credit_grants','credit_holds','credit_consumptions','credit_jobs','subscription_plans','user_subscriptions','subscription_periods','credit_admin_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'credit\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- **켜기 전이라면 할 일이 없다.** `CREDIT_LEDGER` 를 켜지 않고 계정을
-- 전환하지 않으면 이 표와 함수는 한 번도 안 불린다. 그냥 두면 된다.
--
-- 켠 뒤라면 **되돌리기와 폐기는 다르다.**
--
--   되돌리기   `CREDIT_LEDGER` 를 끈다. 202609220002 의 래퍼가 전환하지 않은
--              회원을 그대로 옛 함수로 보낸다. **전환한 회원은 그 순간
--              `credit_ledger_required` 로 막힌다** — 새 단위로 쓴 것을 옛
--              한도에 섞지 않으려는 의도적인 차단이다. 지급한 크레딧은 남는다.
--
--   폐기       표를 지우는 것. **지급한 크레딧과 차감 이력이 사라진다.**
--              돈이 한 번이라도 오갔으면 이건 되돌리기가 아니라 장부 파기다.
--
-- ⚠ **옛 함수로 완전히 돌아가면 전환한 회원이 즉시 막힐 수 있다.**
--
--    `reserve_generation_cost_v1` 의 사용량 집계에는 `pricing_policy` 필터가
--    없다(202609140001 의 142행). 그래서 새 단위로 쓴 소비가 옛 단위 사용량으로
--    그대로 더해진다 — 한도 30 인 회원이 새 단위로 40 을 썼으면 되돌린 그
--    자리에서 `quota_exceeded` 다.
--
--    `scripts/tests/credit-ledger.test.mjs` 의
--    「rolling back to the old functions charges new-unit spending against the
--    old limit」이 이 동작을 실제 PostgreSQL 에서 잠가 두었다. 고쳐지면 그
--    테스트가 먼저 말해 준다.
--
--    돌아가려면 그 전에 회원별 `profiles.monthly_quota` 를 환산 비율로 되돌린다.
--    원래 값은 `credit_accounts.legacy_snapshot` 에 있다.
--    **팀 한도는 `credit_admin_events.result` 의 `legacy_quota` 에만 있다** —
--    `teams.monthly_quota` 는 전환 때 덮어썼고 floor 로 나머지를 잃었다.
