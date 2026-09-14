begin;

create function public.require_generation_lease(p_id uuid,p_token uuid) returns public.generation_runs
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype;
begin
  select * into r from public.generation_runs where id=p_id for update;
  if not found or p_token is null or r.lease_token is distinct from p_token or r.lease_until<=now()
    or r.state in ('succeeded','failed','cancelled','needs_reconciliation') then raise exception 'lease_lost'; end if;
  return r;
end $$;

create function public.prepare_generation_attempt(p_run uuid,p_token uuid,p_spec jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype; a public.generation_attempts%rowtype; maximum bigint;
begin
  perform public.lock_usage_budget();
  r := public.require_generation_lease(p_run,p_token);
  if r.stop_requested_at is not null then raise exception 'stop_requested'; end if;
  if not exists(select 1 from public.profiles where id=r.user_id and status='active' and email_confirmed_at is not null) then raise exception 'inactive_member'; end if;
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

create function public.advance_generation_attempt(p_id uuid,p_token uuid,p_patch jsonb) returns jsonb
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
    if r.stop_requested_at is not null then raise exception 'stop_requested'; end if;
    if not exists(select 1 from public.profiles where id=r.user_id and status='active') then raise exception 'inactive_member'; end if;
    if not (select admission_enabled from public.usage_controls where singleton) then raise exception 'admission_closed'; end if;
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

create function public.checkpoint_generation_run(p_id uuid,p_token uuid,p_checkpoint jsonb,p_state text,p_delay_seconds integer default 5) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype;
begin
  r := public.require_generation_lease(p_id,p_token);
  if p_state not in ('running','collecting','settlement_pending') or jsonb_typeof(p_checkpoint) is distinct from 'object' then raise exception 'invalid_checkpoint'; end if;
  update public.generation_runs set checkpoint=p_checkpoint,state=p_state,updated_at=now(),
    next_check_at=now()+make_interval(secs=>least(greatest(p_delay_seconds,0),3600)),
    lease_until=case when p_state='settlement_pending' then lease_until else now() end
    where id=p_id returning * into r;
  return to_jsonb(r);
end $$;

create function public.settle_generation_v2(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype; e public.generation_events%rowtype; amount bigint; cost bigint; successes integer;
begin
  perform public.lock_usage_budget();
  select * into r from public.generation_runs where id=p_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.state in ('succeeded','failed','cancelled') then return to_jsonb(r); end if;
  r := public.require_generation_lease(p_id,p_token);
  if r.state<>'settlement_pending' then raise exception 'not_ready_to_settle'; end if;
  if exists(select 1 from public.generation_attempts where run_id=p_id and state not in ('stored','failed','cancelled')) then raise exception 'attempts_unresolved'; end if;
  select * into e from public.generation_events where id=r.event_id for update;
  select ceil(coalesce(sum(case when state='stored' then
      coalesce((price_snapshot->>'chargeUnitMicrousd')::bigint,0)*delivered_images+
      coalesce((price_snapshot->>'chargeFlatMicrousd')::bigint,0) else 0 end),0)/50000.0)::bigint,
    coalesce(sum(case when submitted_at is null then 0 else coalesce(measured_cost_microusd,estimated_cost_microusd) end),0),
    count(*) filter(where state='stored')
    into amount,cost,successes from public.generation_attempts where run_id=p_id;
  if amount>e.requested_units then
    update public.generation_runs set state='needs_reconciliation',error_code='credit_estimate_exceeded',updated_at=now() where id=p_id returning * into r;
    return to_jsonb(r);
  end if;
  -- User billing remains capped by the approved hold. Provider costs are not
  -- truncated by this cap and include unsuccessful provider attempts.
  update public.generation_events set status=case when successes>0 then 'succeeded' else 'failed' end,
    consumed_units=amount,completed_at=now(),error_code=case when successes>0 then null else 'no_output' end where id=e.id;
  update public.usage_budget_days set reserved_cost_microusd=reserved_cost_microusd-r.max_cost_microusd where day=r.cost_day;
  -- Actual/estimated provider costs belong to each attempt's submission day,
  -- not to the day a long run was originally admitted or finally settled.
  insert into public.usage_budget_days(day,committed_cost_microusd)
    select (submitted_at at time zone 'Asia/Seoul')::date,
      sum(coalesce(measured_cost_microusd,estimated_cost_microusd))
    from public.generation_attempts where run_id=p_id and submitted_at is not null
    group by (submitted_at at time zone 'Asia/Seoul')::date
    on conflict(day) do update set committed_cost_microusd=usage_budget_days.committed_cost_microusd+excluded.committed_cost_microusd;
  update public.generation_runs set state=case when successes>0 then 'succeeded' when stop_requested_at is not null then 'cancelled' else 'failed' end,
    cost_microusd=cost,settled_at=now(),updated_at=now(),lease_until=null where id=p_id returning * into r;
  return to_jsonb(r);
end $$;

create function public.request_stop_generation(p_actor uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype;
begin
  update public.generation_runs set stop_requested_at=coalesce(stop_requested_at,now()),updated_at=now()
    where id=p_id and user_id=p_actor returning * into r;
  if not found then raise exception 'not_owner'; end if;
  return to_jsonb(r);
end $$;

revoke all on function public.require_generation_lease(uuid,uuid),public.prepare_generation_attempt(uuid,uuid,jsonb),
  public.advance_generation_attempt(uuid,uuid,jsonb),public.checkpoint_generation_run(uuid,uuid,jsonb,text,integer),
  public.settle_generation_v2(uuid,uuid),public.request_stop_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.require_generation_lease(uuid,uuid),public.prepare_generation_attempt(uuid,uuid,jsonb),
  public.advance_generation_attempt(uuid,uuid,jsonb),public.checkpoint_generation_run(uuid,uuid,jsonb,text,integer),
  public.settle_generation_v2(uuid,uuid),public.request_stop_generation(uuid,uuid) to service_role;
commit;
