begin;

create function public.save_sns_draft_v2(p_actor uuid,p_id uuid,p_flow jsonb,p_status text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if jsonb_typeof(p_flow) is distinct from 'object' or p_status not in ('draft','planning','copy_ready','generating','ready','failed') then raise exception 'invalid_draft'; end if;
  update public.sns_projects set data=jsonb_set(data,'{flow}',p_flow),updated_at=now(),
    status=case when exists(select 1 from public.generation_runs where resource_type='sns' and resource_id=p_id and operation='sns_image' and state not in ('succeeded','failed','cancelled')) then 'generating' else p_status end
    where id=p_id and user_id=p_actor;
  if not found then raise exception 'not_owner'; end if;
end $$;
revoke all on function public.save_sns_draft_v2(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_sns_draft_v2(uuid,uuid,jsonb,text) to service_role;
create or replace function public.settle_generation_v2(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype; e public.generation_events%rowtype; amount bigint; cost bigint; successes integer; paid_cards integer;
begin
  perform public.lock_usage_budget();
  select * into r from public.generation_runs where id=p_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.state in ('succeeded','failed','cancelled') then return to_jsonb(r); end if;
  r := public.require_generation_lease(p_id,p_token);
  if r.state<>'settlement_pending' then raise exception 'not_ready_to_settle'; end if;
  if exists(select 1 from public.generation_attempts where run_id=p_id and state not in ('stored','failed','cancelled')) then raise exception 'attempts_unresolved'; end if;
  select * into e from public.generation_events where id=r.event_id for update;
  select coalesce(sum(case when state='stored' then
      coalesce((price_snapshot->>'chargeUnitMicrousd')::bigint,0)*delivered_images+
      coalesce((price_snapshot->>'chargeFlatMicrousd')::bigint,0) else 0 end),0),
    coalesce(sum(case when submitted_at is null then 0 else coalesce(measured_cost_microusd,estimated_cost_microusd) end),0),
    count(*) filter(where state='stored')
    into amount,cost,successes from public.generation_attempts where run_id=p_id;
  if r.operation in ('pdp_image','redesign_generate','redesign_edit','poster_image','sns_image') then
    select coalesce(sum(delivered_images),0) into successes from public.generation_attempts where run_id=p_id and state='stored';
  end if;
  if r.resource_type='sns' then
    select count(*),count(*) filter(where coalesce(card->>'falRequestId','')<>'' or exists(
      select 1 from jsonb_array_elements(coalesce(card->'slotJobs','[]')) j where j->>'status'='done' and coalesce(j->>'falRequestId','')<>''))
      into successes,paid_cards from jsonb_array_elements(coalesce(r.checkpoint#>'{flow,cards}','[]')) card
      where card->>'status' in ('done','review_required') and card->>'index' in (
        select jsonb_array_elements_text(coalesce(r.checkpoint#>'{flow,generation,selectedCardIndexes}','[]')));
    if paid_cards>0 then amount:=amount+(1+paid_cards)*coalesce((r.execution_snapshot->>'customerLlmUnitMicrousd')::bigint,0); end if;
  end if;
  amount:=ceil(amount/50000.0)::bigint;
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
  if r.resource_type='sns' then
    update public.sns_projects set status='ready',updated_at=now() where id=r.resource_id and user_id=r.user_id;
  end if;
  if r.resource_type='poster' then
    update public.poster_projects set status=case when successes>0 then 'done' else 'ready' end,updated_at=now()
      where id=r.resource_id and user_id=r.user_id;
  end if;
  update public.generation_runs set state=case when successes>0 then 'succeeded' when stop_requested_at is not null then 'cancelled' else 'failed' end,
    cost_microusd=cost,settled_at=now(),updated_at=now(),lease_until=null where id=p_id returning * into r;
  return to_jsonb(r);
end $$;
commit;
