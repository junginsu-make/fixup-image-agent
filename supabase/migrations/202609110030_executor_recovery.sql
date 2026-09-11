begin;
create function public.recover_generation_acceptance(p_run uuid,p_attempt uuid,p_provider_id text) returns boolean
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype; a public.generation_attempts%rowtype;
begin
  perform public.lock_usage_budget();
  select * into r from public.generation_runs where id=p_run for update;
  select * into a from public.generation_attempts where id=p_attempt and run_id=p_run for update;
  if r.id is null or a.id is null or a.provider<>'fal' then raise exception 'invalid_journal_target'; end if;
  if p_provider_id is null or length(p_provider_id) not between 1 and 256 or p_provider_id !~ '^[A-Za-z0-9_-]+$' then raise exception 'invalid_provider_id'; end if;
  if a.provider_request_id=p_provider_id then return true; end if;
  if a.provider_request_id is not null then raise exception 'provider_identity_conflict'; end if;
  if r.state in ('succeeded','failed','cancelled') or a.state not in ('submitting','unknown') then raise exception 'journal_requires_review'; end if;
  if r.lease_until>now() then return false; end if;
  update public.generation_attempts set state='submitted',provider_request_id=p_provider_id,error_code=null where id=a.id;
  update public.generation_runs set state='collecting',error_code=null,next_check_at=now(),lease_until=null,lease_token=null,updated_at=now() where id=r.id;
  insert into public.usage_audit_events(action,target_id,before_value,after_value,reason)
    values('recover_acceptance',a.id,jsonb_build_object('state',a.state),jsonb_build_object('providerRequestId',p_provider_id),'Durable server acceptance journal');
  return true;
end $$;
create function public.mark_generation_review(p_id uuid,p_token uuid,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.generation_runs%rowtype;
begin
  perform public.lock_usage_budget();
  select * into r from public.generation_runs where id=p_id for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.state in ('succeeded','failed','cancelled','needs_reconciliation') then return; end if;
  r := public.require_generation_lease(p_id,p_token);
  update public.generation_runs set state='needs_reconciliation',error_code=p_reason,lease_until=null,updated_at=now() where id=p_id;
end $$;
revoke all on function public.recover_generation_acceptance(uuid,uuid,text),public.mark_generation_review(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.recover_generation_acceptance(uuid,uuid,text),public.mark_generation_review(uuid,uuid,text) to service_role;
commit;
