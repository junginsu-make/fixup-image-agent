-- Expand only. New execution remains closed until the compatible application,
-- heartbeat and an explicit operator budget are installed. No existing quota is changed.
begin;

alter table public.generation_events add column protocol_version smallint not null default 1
  check (protocol_version in (1,2));

create table public.usage_controls (
  singleton boolean primary key default true check(singleton),
  admission_enabled boolean not null default false,
  daily_cost_limit_microusd bigint check(daily_cost_limit_microusd>0),
  unresolved_exposure_limit_microusd bigint check(unresolved_exposure_limit_microusd>0),
  policy_version integer not null default 1,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.usage_controls(singleton) values(true);

create table public.usage_budget_days (
  day date primary key,
  reserved_cost_microusd bigint not null default 0 check(reserved_cost_microusd>=0),
  committed_cost_microusd bigint not null default 0 check(committed_cost_microusd>=0)
);
create table public.usage_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null, target_id uuid,
  before_value jsonb, after_value jsonb, reason text not null,
  created_at timestamptz not null default now()
);
create table public.generation_executor_health (
  executor_id text primary key,
  release_id text not null,
  protocol_version integer not null,
  succeeded_at timestamptz not null,
  error_code text
);

create table public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  team_id_snapshot uuid references public.teams(id),
  event_id uuid not null unique references public.generation_events(id),
  idempotency_key uuid not null,
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  operation text not null,
  resource_type text check(resource_type in ('sns','poster','character')),
  resource_id uuid,
  execution_snapshot jsonb not null check(jsonb_typeof(execution_snapshot)='object'),
  checkpoint jsonb not null default '{}',
  state text not null default 'prepared' check(state in
    ('prepared','running','collecting','settlement_pending','succeeded','failed','cancelled','needs_reconciliation')),
  stop_requested_at timestamptz,
  lease_token uuid, lease_epoch bigint not null default 0, lease_until timestamptz,
  next_check_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  result_manifest jsonb not null default '{}',
  cost_day date not null,
  max_cost_microusd bigint not null check(max_cost_microusd>0),
  cost_microusd bigint,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  settled_at timestamptz, error_code text,
  unique(user_id,idempotency_key)
);
create unique index generation_runs_one_image_per_user on public.generation_runs(user_id)
  where operation in ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image')
    and state not in ('succeeded','failed','cancelled');
create index generation_runs_due on public.generation_runs(next_check_at,created_at)
  where state not in ('succeeded','failed','cancelled');
create index generation_runs_resource on public.generation_runs(resource_type,resource_id,created_at);

create table public.generation_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.generation_runs(id),
  logical_step text not null,
  sequence integer not null check(sequence>=0),
  provider text not null, model text not null, endpoint text not null,
  state text not null default 'prepared' check(state in
    ('prepared','submitting','submitted','result_ready','stored','failed','unknown','cancelled')),
  provider_request_id text,
  request_hash text not null,
  request_payload jsonb not null,
  price_snapshot jsonb not null,
  output_manifest jsonb,
  requested_images integer not null default 0 check(requested_images>=0),
  returned_images integer not null default 0 check(returned_images>=0),
  delivered_images integer not null default 0 check(delivered_images>=0),
  credit_units integer not null default 0 check(credit_units>=0),
  estimated_cost_microusd bigint not null check(estimated_cost_microusd>=0),
  measured_cost_microusd bigint check(measured_cost_microusd>=0),
  input_tokens bigint check(input_tokens>=0), output_tokens bigint check(output_tokens>=0),
  metering_state text not null default 'unknown' check(metering_state in ('observed','estimated','unknown')),
  billable_state text not null default 'pending' check(billable_state in ('pending','estimated','reconciled','unknown')),
  submitted_at timestamptz, completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique(run_id,logical_step,sequence)
);
create unique index generation_attempts_provider_id on public.generation_attempts(provider,endpoint,provider_request_id)
  where provider_request_id is not null;
create index generation_attempts_recovery on public.generation_attempts(state,submitted_at);

alter table public.sns_generation_requests add column run_id uuid references public.generation_runs(id),
  add column attempt_id uuid unique references public.generation_attempts(id);
alter table public.poster_generation_requests add column run_id uuid references public.generation_runs(id),
  add column attempt_id uuid unique references public.generation_attempts(id);

-- Short budget transactions share this lock, including the compatibility RPCs.
-- A singleton budget is the first lock in the documented lock order; no network
-- work is done while holding it. This also serializes membership/quota mutations.
create function public.lock_usage_budget() returns void language sql security definer set search_path=public
as $$ select pg_advisory_xact_lock(183602,1) $$;

create function public.begin_generation_v2(p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  actor uuid := (p_input->>'userId')::uuid;
  req uuid := (p_input->>'key')::uuid;
  op text := p_input->>'operation';
  units integer := (p_input->>'units')::integer;
  max_cost bigint := (p_input->>'maxCostMicrousd')::bigint;
  profile public.profiles%rowtype;
  controls public.usage_controls%rowtype;
  previous public.generation_runs%rowtype;
  result public.generation_runs%rowtype;
  team uuid; team_quota integer; used bigint; team_used bigint;
  period date := date_trunc('month',now() at time zone 'Asia/Seoul')::date;
  budget_day date := (now() at time zone 'Asia/Seoul')::date;
  event uuid := gen_random_uuid();
  resource uuid := nullif(p_input->>'resourceId','')::uuid;
  resource_type text := p_input->>'resourceType';
  owner uuid;
begin
  perform public.lock_usage_budget();
  select * into profile from public.profiles where id=actor for update;
  if not found or profile.status<>'active' or profile.email_confirmed_at is null then raise exception 'inactive_member'; end if;
  select * into previous from public.generation_runs where user_id=actor and idempotency_key=req;
  if found then
    if previous.input_hash is distinct from p_input->>'inputHash' or previous.operation is distinct from op
      or previous.resource_id is distinct from resource or previous.resource_type is distinct from resource_type then raise exception 'idempotency_conflict'; end if;
    return to_jsonb(previous);
  end if;
  select * into controls from public.usage_controls where singleton for update;
  if not controls.admission_enabled or controls.daily_cost_limit_microusd is null
    or controls.unresolved_exposure_limit_microusd is null then raise exception 'admission_closed'; end if;
  if op is null or op not in ('pdp_analyze','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image',
      'redesign_transcribe','sns_plan','sns_caption','layout_analyze','poster_review')
    or units is null or units<0 or units>public.max_reserve_units() or max_cost is null or max_cost<=0
    or coalesce(p_input->>'inputHash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_input->'snapshot') is distinct from 'object' then raise exception 'invalid_request'; end if;
  if op in ('sns_image','sns_plan','sns_caption') and (resource_type is distinct from 'sns' or resource is null) then raise exception 'resource_required'; end if;
  if op in ('poster_image','poster_review') and (resource_type is distinct from 'poster' or resource is null) then raise exception 'resource_required'; end if;
  if resource_type='sns' then select user_id into owner from public.sns_projects where id=resource;
  elsif resource_type='poster' then select user_id into owner from public.poster_projects where id=resource;
  elsif resource_type='character' then select user_id into owner from public.characters where id=resource;
  elsif resource is not null then raise exception 'invalid_resource'; end if;
  if resource_type is not null and owner is distinct from actor then raise exception 'not_owner'; end if;

  select team_id into team from public.team_members where user_id=actor;
  if team is not null then select monthly_quota into team_quota from public.teams where id=team and deleted_at is null for update; end if;
  select coalesce(sum(case when status='succeeded' then consumed_units else requested_units end),0) into used
    from public.generation_events where user_id=actor and period_start=period
    and (status='succeeded' or (status='reserved' and (protocol_version=2 or expires_at>now())));
  if used+units>profile.monthly_quota then raise exception 'quota_exceeded'; end if;
  select coalesce(sum(case when status='succeeded' then consumed_units else requested_units end),0) into team_used
    from public.generation_events where team_id=team and period_start=period
    and (status='succeeded' or (status='reserved' and (protocol_version=2 or expires_at>now())));
  if coalesce(team_quota,0)>0 and team_used+units>team_quota then raise exception 'team_quota_exceeded'; end if;

  if op in ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image') then
    if exists(select 1 from public.generation_events where user_id=actor and status='reserved'
      and operation in ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image')
      and (protocol_version=2 or expires_at>now())) then raise exception 'concurrent_limit'; end if;
  else
    if exists(select 1 from public.generation_runs where user_id=actor and state not in ('succeeded','failed','cancelled')
      and operation not in ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image')) then raise exception 'concurrent_limit'; end if;
    if (select count(*) from public.generation_runs where user_id=actor and operation=op and created_at>now()-interval '1 hour')>=10
      or (select count(*) from public.generation_runs where user_id=actor and operation not in
        ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image') and created_at>now()-interval '1 hour')>=30
      then raise exception 'analysis_rate_limit'; end if;
  end if;
  insert into public.usage_budget_days(day) values(budget_day) on conflict do nothing;
  -- Every unresolved run counts today, including a run admitted before midnight.
  -- Keep its original reservation bucket until settlement; do not erase exposure
  -- by only summing today's budget row.
  if (select committed_cost_microusd from public.usage_budget_days where day=budget_day)
      +(select coalesce(sum(max_cost_microusd),0) from public.generation_runs where state not in ('succeeded','failed','cancelled'))
      +max_cost>controls.daily_cost_limit_microusd
    or (select coalesce(sum(max_cost_microusd),0) from public.generation_runs where state not in ('succeeded','failed','cancelled'))
       +max_cost>controls.unresolved_exposure_limit_microusd then raise exception 'provider_budget_exceeded'; end if;
  insert into public.generation_events(id,user_id,request_id,operation,period_start,requested_units,expires_at,team_id,protocol_version)
    values(event,actor,req,op,period,units,now()+interval '10 minutes',team,2);
  insert into public.generation_runs(user_id,team_id_snapshot,event_id,idempotency_key,input_hash,operation,resource_type,resource_id,
    execution_snapshot,cost_day,max_cost_microusd)
    values(actor,team,event,req,p_input->>'inputHash',op,resource_type,resource,p_input->'snapshot',budget_day,max_cost) returning * into result;
  update public.usage_budget_days set reserved_cost_microusd=reserved_cost_microusd+max_cost where day=budget_day;
  return to_jsonb(result);
end $$;

create function public.claim_generation_run(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare result public.generation_runs%rowtype;
begin
  select * into result from public.generation_runs
    where (p_id is null or id=p_id) and state not in ('succeeded','failed','cancelled','needs_reconciliation')
      and next_check_at<=now() and (lease_until is null or lease_until<now())
    order by next_check_at,created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.generation_runs set lease_token=gen_random_uuid(),lease_epoch=lease_epoch+1,
    lease_until=now()+interval '210 seconds',updated_at=now() where id=result.id returning * into result;
  return to_jsonb(result);
end $$;

-- Extend the event operation contract without changing old RPC signatures.
alter table public.generation_events drop constraint generation_events_operation_check;
alter table public.generation_events add constraint generation_events_operation_check check(operation in
  ('pdp_analyze','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image',
   'redesign_transcribe','sns_plan','sns_caption','layout_analyze','poster_review'));

do $$ declare name text; begin
  foreach name in array array['usage_controls','usage_budget_days','usage_audit_events','generation_executor_health','generation_runs','generation_attempts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant all on public.%I to service_role',name);
  end loop;
end $$;
revoke all on function public.lock_usage_budget() from public,anon,authenticated;
revoke all on function public.begin_generation_v2(jsonb) from public,anon,authenticated;
revoke all on function public.claim_generation_run(uuid) from public,anon,authenticated;
grant execute on function public.lock_usage_budget(),public.begin_generation_v2(jsonb),public.claim_generation_run(uuid) to service_role;

commit;
