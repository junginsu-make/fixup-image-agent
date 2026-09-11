begin;
-- Legacy rows never had an at-call unit price. Freeze the first available
-- estimate without changing their customer credits or claiming invoice accuracy.
create table public.legacy_generation_prices(
  event_id uuid primary key references public.generation_events(id) on delete cascade,
  model text not null,unit_usd numeric not null check(unit_usd>0),recorded_at timestamptz not null default now()
);
alter table public.legacy_generation_prices enable row level security;
revoke all on public.legacy_generation_prices from public,anon,authenticated;
grant all on public.legacy_generation_prices to service_role;
lock table public.generation_events in share row exclusive mode;
insert into public.legacy_generation_prices(event_id,model,unit_usd)
  select e.id,e.model,p.unit_cost_usd from public.generation_events e join public.model_prices p on p.model=e.model
  where e.protocol_version=1 and p.unit_cost_usd>0;
create function public.freeze_legacy_generation_price() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.protocol_version=1 then
    insert into public.legacy_generation_prices(event_id,model,unit_usd)
      select new.id,new.model,unit_cost_usd from public.model_prices where model=new.model and unit_cost_usd>0
      on conflict(event_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.freeze_legacy_generation_price() from public,anon,authenticated;
create trigger freeze_legacy_generation_price after insert or update of model on public.generation_events
  for each row execute function public.freeze_legacy_generation_price();
create view public.generation_cost_entries as
  select e.id as entry_id,e.user_id,e.operation,coalesce(e.model,'legacy_unknown') as model,e.created_at as occurred_at,
    coalesce(e.billable_images,0)::bigint as images,
    coalesce(e.billable_images,0)*coalesce(p.unit_usd,0)+e.llm_usd as usd,
    case when e.status='failed' then coalesce(e.billable_images,0)*coalesce(p.unit_usd,0)+e.llm_usd else 0 end as wasted_usd,
    case when e.status='failed' then coalesce(e.billable_images,0) else 0 end::bigint as wasted_images,
    ((coalesce(e.billable_images,0)>0 and p.unit_usd is null) or (coalesce(e.model,'')='' and e.llm_usd=0)) as unknown_cost,
    false as pending_cost,1 as protocol_version
  from public.generation_events e left join public.legacy_generation_prices p on p.event_id=e.id
  where e.protocol_version=1 and e.status in ('succeeded','failed')
  union all
  select a.id,r.user_id,r.operation,a.model,a.submitted_at,a.returned_images::bigint,
    coalesce(a.measured_cost_microusd,a.estimated_cost_microusd)/1000000.0,
    case when r.state in ('succeeded','failed','cancelled') then
      case when a.returned_images>0 then coalesce(a.measured_cost_microusd,a.estimated_cost_microusd)/1000000.0*(a.returned_images-a.delivered_images)/a.returned_images
        when r.state in ('failed','cancelled') then coalesce(a.measured_cost_microusd,a.estimated_cost_microusd)/1000000.0 else 0 end
      else 0 end,
    case when r.state in ('succeeded','failed','cancelled') then greatest(0,a.returned_images-a.delivered_images) else 0 end::bigint,
    (a.billable_state='unknown' or (a.metering_state='unknown' and a.state in ('result_ready','stored','failed','cancelled'))),
    (a.billable_state='pending' and a.state in ('submitting','submitted')),2
  from public.generation_attempts a join public.generation_runs r on r.id=a.run_id where a.submitted_at is not null;
revoke all on public.generation_cost_entries from public,anon,authenticated;
grant select on public.generation_cost_entries to service_role;
create function public.admin_cost_summary_v2() returns table(today_usd numeric,month_usd numeric,total_usd numeric,today_images bigint,month_images bigint,total_images bigint,wasted_usd numeric,wasted_images bigint,unknown_calls bigint,pending_calls bigint)
language sql security definer set search_path=public as $$
  select coalesce(sum(usd) filter(where (occurred_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),0),
    coalesce(sum(usd) filter(where date_trunc('month',occurred_at at time zone 'Asia/Seoul')=date_trunc('month',now() at time zone 'Asia/Seoul')),0),coalesce(sum(usd),0),
    coalesce(sum(images) filter(where (occurred_at at time zone 'Asia/Seoul')::date=(now() at time zone 'Asia/Seoul')::date),0)::bigint,
    coalesce(sum(images) filter(where date_trunc('month',occurred_at at time zone 'Asia/Seoul')=date_trunc('month',now() at time zone 'Asia/Seoul')),0)::bigint,
    coalesce(sum(images),0)::bigint,coalesce(sum(wasted_usd),0),coalesce(sum(wasted_images),0)::bigint,count(*) filter(where unknown_cost),count(*) filter(where pending_cost)
  from public.generation_cost_entries;
$$;
create function public.admin_cost_by_member_v2(p_user_ids uuid[]) returns table(user_id uuid,month_usd numeric,total_usd numeric,total_images bigint)
language sql security definer set search_path=public as $$
  select user_id,coalesce(sum(usd) filter(where date_trunc('month',occurred_at at time zone 'Asia/Seoul')=date_trunc('month',now() at time zone 'Asia/Seoul')),0),coalesce(sum(usd),0),sum(images)::bigint
  from public.generation_cost_entries where user_id=any(p_user_ids) group by user_id;
$$;
create function public.admin_cost_by_operation_v2(p_days integer default 30) returns table(operation text,images bigint,usd numeric)
language sql security definer set search_path=public as $$
  select operation,sum(images)::bigint,sum(usd) from public.generation_cost_entries where occurred_at>=now()-make_interval(days=>greatest(1,p_days)) group by operation order by 3 desc;
$$;
create function public.admin_cost_by_model_v2(p_days integer default 30) returns table(model text,label text,unit_cost_usd numeric,images bigint,usd numeric)
language sql security definer set search_path=public as $$
  select model,model,case when sum(images)>0 then sum(usd)/sum(images) else 0 end,sum(images)::bigint,sum(usd)
  from public.generation_cost_entries where occurred_at>=now()-make_interval(days=>greatest(1,p_days)) group by model order by 5 desc;
$$;
create function public.admin_cost_daily_v2(p_days integer default 30) returns table(usage_date date,images bigint,usd numeric,wasted_usd numeric)
language sql security definer set search_path=public as $$
  select (occurred_at at time zone 'Asia/Seoul')::date,sum(images)::bigint,sum(usd),sum(wasted_usd)
  from public.generation_cost_entries where occurred_at>=now()-make_interval(days=>greatest(1,p_days)) group by 1 order by 1;
$$;
revoke all on function public.admin_cost_summary_v2(),public.admin_cost_by_member_v2(uuid[]),public.admin_cost_by_operation_v2(integer),public.admin_cost_by_model_v2(integer),public.admin_cost_daily_v2(integer) from public,anon,authenticated;
grant execute on function public.admin_cost_summary_v2(),public.admin_cost_by_member_v2(uuid[]),public.admin_cost_by_operation_v2(integer),public.admin_cost_by_model_v2(integer),public.admin_cost_daily_v2(integer) to service_role;
create function public.set_generation_controls(p_actor uuid,p_enabled boolean,p_daily bigint,p_unresolved bigint,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare old_value jsonb;new_value jsonb;
begin
  perform public.lock_usage_budget();
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and email_confirmed_at is not null) then raise exception 'admin_required'; end if;
  if p_enabled is null or length(trim(coalesce(p_reason,'')))<3 or length(p_reason)>1000 or p_daily<=0 or p_unresolved<=0 then raise exception 'invalid_policy'; end if;
  if p_enabled then
    if p_daily is null or p_unresolved is null then raise exception 'budget_required'; end if;
    perform public.assert_generation_executor_ready();
  end if;
  select to_jsonb(c) into old_value from public.usage_controls c where singleton for update;
  if not found then raise exception 'policy_not_found'; end if;
  update public.usage_controls set admission_enabled=p_enabled,daily_cost_limit_microusd=p_daily,unresolved_exposure_limit_microusd=p_unresolved,policy_version=policy_version+1,updated_by=p_actor,updated_at=now() where singleton;
  select to_jsonb(c) into new_value from public.usage_controls c where singleton;
  insert into public.usage_audit_events(actor_id,action,before_value,after_value,reason) values(p_actor,'set_generation_controls',old_value,new_value,p_reason);
end $$;
create function public.resolve_generation_attempt(p_actor uuid,p_attempt uuid,p_cost bigint,p_evidence text,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype;a public.generation_attempts%rowtype;
begin
  perform public.lock_usage_budget();
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and email_confirmed_at is not null) then raise exception 'admin_required'; end if;
  if p_cost is null or p_cost<0 or length(trim(coalesce(p_evidence,'')))<3 or length(trim(coalesce(p_reason,'')))<3 then raise exception 'evidence_required'; end if;
  select run_id into r.id from public.generation_attempts where id=p_attempt;
  select * into r from public.generation_runs where id=r.id for update;
  select * into a from public.generation_attempts where id=p_attempt for update;
  if r.id is null or r.state<>'needs_reconciliation' or a.state not in ('submitting','submitted','unknown','stored') then raise exception 'review_required'; end if;
  if a.state='stored' and a.measured_cost_microusd is not null then raise exception 'cost_already_recorded'; end if;
  update public.generation_attempts set state=case when a.state='stored' then 'stored' else 'failed' end,measured_cost_microusd=p_cost,metering_state='observed',billable_state='reconciled',error_code=case when a.state='stored' then null else 'operator_confirmed_no_delivery' end,completed_at=now() where id=p_attempt;
  insert into public.usage_audit_events(actor_id,action,target_id,before_value,after_value,reason)
    values(p_actor,'resolve_generation_attempt',a.id,to_jsonb(a),jsonb_build_object('costMicrousd',p_cost,'evidence',p_evidence),p_reason);
  if not exists(select 1 from public.generation_attempts where run_id=r.id and (state='unknown' or (state='submitting' and provider_request_id is null))) then
    update public.generation_runs set state='running',error_code=null,next_check_at=now(),lease_token=null,lease_until=null,updated_at=now() where id=r.id;
  end if;
end $$;
revoke all on function public.set_generation_controls(uuid,boolean,bigint,bigint,text),public.resolve_generation_attempt(uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.set_generation_controls(uuid,boolean,bigint,bigint,text),public.resolve_generation_attempt(uuid,uuid,bigint,text,text) to service_role;
create or replace function public.generation_runtime_status() returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object('protocol',2,'schemaVersion',31,'executorFresh',exists(select 1 from public.generation_executor_health where protocol_version=2 and succeeded_at>now()-interval '5 minutes' and error_code is null),
    'admissionEnabled',admission_enabled,'budgetConfigured',daily_cost_limit_microusd is not null and unresolved_exposure_limit_microusd is not null,
    'activeInline',(select count(*) from public.generation_runs where execution_snapshot->>'kind' in ('sync_image','llm') and state not in ('succeeded','failed','cancelled','needs_reconciliation') and lease_until>now()))
  from public.usage_controls where singleton;
$$;
create function public.pause_generation_for_deploy(p_release text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare old_value jsonb;new_value jsonb;pause_id uuid;
begin
  perform public.lock_usage_budget();
  select to_jsonb(c) into old_value from public.usage_controls c where singleton for update;
  if not found then raise exception 'policy_not_found'; end if;
  update public.usage_controls set admission_enabled=false,policy_version=policy_version+1,updated_by=null,updated_at=now() where singleton;
  select to_jsonb(c) into new_value from public.usage_controls c where singleton;
  insert into public.usage_audit_events(action,before_value,after_value,reason) values('deployment_pause',old_value,new_value,'Deploy '||p_release) returning id into pause_id;
  return jsonb_build_object('pauseId',pause_id,'wasEnabled',old_value->'admission_enabled',
    'activeLegacy',(select count(*) from public.generation_events where protocol_version=1 and status='reserved'));
end $$;
create function public.resume_generation_after_deploy(p_pause uuid,p_release text) returns boolean
language plpgsql security definer set search_path=public as $$
declare decision public.usage_audit_events%rowtype;c public.usage_controls%rowtype;desired boolean;
begin
  perform public.lock_usage_budget();
  select * into decision from public.usage_audit_events where id=p_pause and action='deployment_pause';
  if not found then raise exception 'pause_not_found'; end if;
  select * into c from public.usage_controls where singleton for update;
  if c.policy_version<>(decision.after_value->>'policy_version')::integer then return false; end if;
  desired:=coalesce((decision.before_value->>'admission_enabled')::boolean,false);
  if desired then
    if c.daily_cost_limit_microusd is null or c.unresolved_exposure_limit_microusd is null or not exists(
      select 1 from public.generation_executor_health where release_id=p_release and protocol_version=2 and error_code is null and succeeded_at>now()-interval '5 minutes'
    ) then raise exception 'executor_unavailable'; end if;
  end if;
  update public.usage_controls set admission_enabled=desired,policy_version=policy_version+1,updated_by=null,updated_at=now() where singleton;
  insert into public.usage_audit_events(action,target_id,before_value,after_value,reason)
    values('deployment_resume',p_pause,to_jsonb(c),jsonb_build_object('admission_enabled',desired),'Finish deployment '||p_release);
  return true;
end $$;
revoke all on function public.pause_generation_for_deploy(text),public.resume_generation_after_deploy(uuid,text) from public,anon,authenticated;
grant execute on function public.pause_generation_for_deploy(text),public.resume_generation_after_deploy(uuid,text) to service_role;
create or replace function public.begin_generation_v2(p_input jsonb) returns jsonb
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
    return to_jsonb(previous)::jsonb || jsonb_build_object('lease_token',null,'lease_until',null,'replayed',true);
  end if;
  select * into controls from public.usage_controls where singleton for update;
  if not controls.admission_enabled or controls.daily_cost_limit_microusd is null
    or controls.unresolved_exposure_limit_microusd is null then raise exception 'admission_closed'; end if;
  perform public.assert_generation_executor_ready();
  if op is null or op not in ('pdp_analyze','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image',
      'redesign_transcribe','sns_plan','sns_caption','layout_analyze','poster_review','poster_plan')
    or units is null or units<0 or units>public.max_reserve_units() or max_cost is null or max_cost<=0
    or coalesce(p_input->>'inputHash','') !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_input->'snapshot') is distinct from 'object' then raise exception 'invalid_request'; end if;
  if op in ('sns_image','sns_plan','sns_caption') and (resource_type is distinct from 'sns' or resource is null) then raise exception 'resource_required'; end if;
  if op in ('poster_image','poster_review','poster_plan') and (resource_type is distinct from 'poster' or resource is null) then raise exception 'resource_required'; end if;
  if resource_type='sns' then select user_id into owner from public.sns_projects where id=resource for update;
  elsif resource_type='poster' then select user_id into owner from public.poster_projects where id=resource for update;
  elsif resource_type='character' then select user_id into owner from public.characters where id=resource for update;
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
    if op='pdp_analyze' then
      if (select count(*) from public.generation_events where user_id=actor and operation=op and created_at>now()-interval '1 hour')
        >=least(1000,greatest(1,coalesce((p_input->>'pdpAnalysisLimit')::integer,10))) then raise exception 'analysis_rate_limit'; end if;
    elsif op in ('redesign_transcribe','sns_plan','sns_caption','layout_analyze','poster_review') then
      if (select count(*) from public.generation_runs where user_id=actor and operation=op and created_at>now()-interval '1 hour')>=10
        or (select count(*) from public.generation_runs where user_id=actor and operation in
          ('redesign_transcribe','sns_plan','sns_caption','layout_analyze','poster_review') and created_at>now()-interval '1 hour')>=30
        then raise exception 'analysis_rate_limit'; end if;
    end if;
  end if;
  insert into public.usage_budget_days(day) values(budget_day) on conflict do nothing;
  -- Every unresolved run counts today, including a run admitted before midnight.
  -- Keep its original reservation bucket until settlement; do not erase exposure
  -- by only summing today's budget row.
  if (select committed_cost_microusd from public.usage_budget_days where day=budget_day)
      +(select coalesce(ceil(sum(usd)*1000000),0) from public.generation_cost_entries where protocol_version=1
        and occurred_at>=date_trunc('day',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
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
  if op='sns_image' then
    if jsonb_typeof(p_input->'snapshot'->'initialFlow') is distinct from 'object' then raise exception 'invalid_snapshot'; end if;
    update public.sns_projects set data=jsonb_set(data,'{executionFlow}',p_input->'snapshot'->'initialFlow'),status='generating',updated_at=now() where id=resource and user_id=actor;
  elsif op='poster_image' then
    update public.poster_projects set status='generating',updated_at=now() where id=resource and user_id=actor;
  end if;
  if coalesce((p_input->>'inline')::boolean,false) then
    update public.generation_runs set state='running',lease_token=gen_random_uuid(),lease_epoch=1,lease_until=now()+interval '210 seconds'
      where id=result.id returning * into result;
  end if;
  return to_jsonb(result);
end $$;


notify pgrst,'reload schema';
commit;
