begin;
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
