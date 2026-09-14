begin;
create function public.assert_generation_executor_ready() returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.generation_executor_health where protocol_version=2 and succeeded_at>now()-interval '5 minutes' and error_code is null) then
    raise exception 'executor_unavailable';
  end if;
end $$;
create function public.record_generation_executor_tick(p_executor text,p_release text,p_ok boolean,p_error text default null) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_executor is null or length(p_executor) not between 1 and 128 or p_release is null or length(p_release) not between 1 and 128 then raise exception 'invalid_executor'; end if;
  insert into public.generation_executor_health(executor_id,release_id,protocol_version,succeeded_at,error_code)
    values(p_executor,p_release,2,case when p_ok then now() else 'epoch'::timestamptz end,case when p_ok then null else coalesce(p_error,'executor_error') end)
    on conflict(executor_id) do update set release_id=excluded.release_id,protocol_version=2,
      succeeded_at=case when p_ok then now() else generation_executor_health.succeeded_at end,error_code=excluded.error_code;
end $$;
create function public.generation_runtime_status() returns jsonb
language sql security definer set search_path=public as $$
  select jsonb_build_object('protocol',2,'executorFresh',exists(select 1 from public.generation_executor_health where protocol_version=2 and succeeded_at>now()-interval '5 minutes' and error_code is null),
    'admissionEnabled',admission_enabled,'budgetConfigured',daily_cost_limit_microusd is not null and unresolved_exposure_limit_microusd is not null)
  from public.usage_controls where singleton;
$$;
revoke all on function public.assert_generation_executor_ready(),public.record_generation_executor_tick(text,text,boolean,text),public.generation_runtime_status() from public,anon,authenticated;
grant execute on function public.assert_generation_executor_ready(),public.record_generation_executor_tick(text,text,boolean,text),public.generation_runtime_status() to service_role;
create or replace function public.prepare_generation_attempt(p_run uuid,p_token uuid,p_spec jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype; a public.generation_attempts%rowtype; maximum bigint;
begin
  perform public.lock_usage_budget();
  r := public.require_generation_lease(p_run,p_token);
  if r.stop_requested_at is not null then raise exception 'stop_requested'; end if;
  if not exists(select 1 from public.profiles where id=r.user_id and status='active' and email_confirmed_at is not null) then raise exception 'inactive_member'; end if;
  perform public.assert_generation_executor_ready();
  select * into a from public.generation_attempts where run_id=p_run and logical_step=p_spec->>'step' and sequence=(p_spec->>'sequence')::integer;
  if found then
    if a.request_hash is distinct from p_spec->>'requestHash' then raise exception 'attempt_conflict'; end if;
    return to_jsonb(a);
  end if;
  maximum := (p_spec->>'maxCostMicrousd')::bigint;
  if maximum is null or maximum<=0 or coalesce(p_spec->>'step','')='' or coalesce(p_spec->>'provider','')=''
    or coalesce(p_spec->>'model','')='' or coalesce(p_spec->>'endpoint','')=''
    or jsonb_typeof(p_spec->'payload') is distinct from 'object' or jsonb_typeof(p_spec->'price') is distinct from 'object'
    or coalesce((p_spec->'price'->>'chargeUnitMicrousd')::bigint,0)<0
    or coalesce((p_spec->'price'->>'chargeFlatMicrousd')::bigint,0)<0 then raise exception 'invalid_attempt'; end if;
  if (select coalesce(sum(estimated_cost_microusd),0) from public.generation_attempts where run_id=p_run)+maximum>r.max_cost_microusd then raise exception 'attempt_budget_exceeded'; end if;
  insert into public.generation_attempts(run_id,logical_step,sequence,provider,model,endpoint,request_hash,request_payload,
    price_snapshot,estimated_cost_microusd,requested_images)
    values(p_run,p_spec->>'step',(p_spec->>'sequence')::integer,p_spec->>'provider',p_spec->>'model',p_spec->>'endpoint',
      p_spec->>'requestHash',p_spec->'payload',p_spec->'price',maximum,coalesce((p_spec->>'requestedImages')::integer,0)) returning * into a;
  update public.generation_runs set attempt_count=attempt_count+1,updated_at=now() where id=p_run;
  return to_jsonb(a);
end $$;

create or replace function public.advance_generation_attempt(p_id uuid,p_token uuid,p_patch jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.generation_attempts%rowtype; r public.generation_runs%rowtype; target text:=p_patch->>'state';
begin
  perform public.lock_usage_budget();
  select run_id into r.id from public.generation_attempts where id=p_id;
  r := public.require_generation_lease(r.id,p_token);
  select * into a from public.generation_attempts where id=p_id for update;
  if target is null then raise exception 'invalid_transition'; end if;
  if target=a.state then
    if (p_patch ? 'providerRequestId' and a.provider_request_id is distinct from p_patch->>'providerRequestId')
      or (p_patch ? 'output' and a.output_manifest is distinct from p_patch->'output')
      or (p_patch ? 'costMicrousd' and a.measured_cost_microusd is distinct from (p_patch->>'costMicrousd')::bigint)
      or (p_patch ? 'deliveredImages' and a.delivered_images is distinct from (p_patch->>'deliveredImages')::integer)
      then raise exception 'attempt_conflict'; end if;
    return to_jsonb(a);
  end if;
  if not ((a.state='prepared' and target in ('submitting','cancelled'))
    or (a.state='submitting' and target in ('submitted','result_ready','failed','unknown'))
    or (a.state='submitted' and target in ('result_ready','failed','unknown','cancelled'))
    or (a.state='result_ready' and target in ('stored','failed','unknown'))) then raise exception 'invalid_transition'; end if;
  if target='submitting' then
    perform public.assert_generation_executor_ready();
    if r.stop_requested_at is not null then raise exception 'stop_requested'; end if;
    if not exists(select 1 from public.profiles where id=r.user_id and status='active') then raise exception 'inactive_member'; end if;
    if (select admission_enabled from public.usage_controls where singleton) is distinct from true then raise exception 'admission_closed'; end if;
    -- A stopped executor may have passed its lease check before an HTTP timeout.
    -- Persist submitting before network I/O; recovery must not resubmit this state.
  end if;
  if a.provider_request_id is not null and p_patch ? 'providerRequestId' and a.provider_request_id is distinct from p_patch->>'providerRequestId' then raise exception 'attempt_conflict'; end if;
  if target='submitted' and coalesce(p_patch->>'providerRequestId',a.provider_request_id,'')='' then raise exception 'provider_id_required'; end if;
  if target='stored' and jsonb_typeof(p_patch->'output') is distinct from 'object' then raise exception 'output_required'; end if;
  update public.generation_attempts set state=target,
    provider_request_id=coalesce(p_patch->>'providerRequestId',provider_request_id),
    output_manifest=case when p_patch ? 'output' then p_patch->'output' else output_manifest end,
    returned_images=coalesce((p_patch->>'returnedImages')::integer,returned_images),
    delivered_images=coalesce((p_patch->>'deliveredImages')::integer,delivered_images),
    measured_cost_microusd=case when p_patch ? 'costMicrousd' then (p_patch->>'costMicrousd')::bigint else measured_cost_microusd end,
    metering_state=coalesce(p_patch->>'meteringState',metering_state),
    billable_state=case when target='unknown' then 'unknown' when p_patch ? 'costMicrousd' then 'estimated' else billable_state end,
    input_tokens=coalesce((p_patch->>'inputTokens')::bigint,input_tokens),output_tokens=coalesce((p_patch->>'outputTokens')::bigint,output_tokens),
    submitted_at=case when target='submitting' then now() else submitted_at end,
    completed_at=case when target in ('stored','failed','cancelled') then now() else completed_at end,
    error_code=coalesce(p_patch->>'errorCode',error_code)
    where id=p_id returning * into a;
  if a.delivered_images>a.returned_images or a.returned_images>a.requested_images then raise exception 'invalid_image_count'; end if;
  if target='unknown' then
    update public.generation_runs set state='needs_reconciliation',error_code='provider_outcome_unknown',lease_until=null,updated_at=now() where id=r.id;
  end if;
  return to_jsonb(a);
end $$;

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

commit;
