begin;
create function public.set_usage_quota_v2(p_actor uuid,p_kind text,p_target uuid,p_quota integer,p_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare old_quota integer;
begin
  perform public.lock_usage_budget();
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and email_confirmed_at is not null) then raise exception 'admin_required'; end if;
  if p_quota is null or p_quota<0 or nullif(trim(p_reason),'') is null then raise exception 'invalid_quota'; end if;
  if p_kind='personal' and p_quota<=10000 then
    select monthly_quota into old_quota from public.profiles where id=p_target for update;
    if not found then raise exception 'profile_not_found'; end if;
    update public.profiles set monthly_quota=p_quota,updated_at=now() where id=p_target;
  elsif p_kind='team' and p_quota<=1000000 then
    select monthly_quota into old_quota from public.teams where id=p_target and deleted_at is null for update;
    if not found then raise exception 'team_not_found'; end if;
    update public.teams set monthly_quota=p_quota,updated_at=now() where id=p_target;
  else raise exception 'invalid_quota'; end if;
  insert into public.usage_audit_events(actor_id,action,target_id,before_value,after_value,reason)
    values(p_actor,'quota_'||p_kind,p_target,jsonb_build_object('quota',old_quota),jsonb_build_object('quota',p_quota),p_reason);
end $$;
revoke all on function public.set_usage_quota_v2(uuid,text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.set_usage_quota_v2(uuid,text,uuid,integer,text) to service_role;

-- Deploy only with the matching server-owned writer adapters. Reads stay under
-- existing RLS; users cannot insert or replace runtime/settlement JSON directly.
revoke insert(data),update(data,status,updated_at) on public.sns_projects from authenticated;
revoke insert(data),update(data,status,updated_at) on public.poster_projects from authenticated;
revoke insert,update on public.sns_cards from authenticated;
-- Revoking a table privilege does not revoke existing column-level privileges.
revoke insert(user_id,project_id,index,kind,role,copy,prompt),update(copy,prompt,asset_path,status,review,error) on public.sns_cards from authenticated;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='sns_cards' and column_name='thumb_path') then
    revoke update(thumb_path) on public.sns_cards from authenticated;
  end if;
end $$;

create function public.protect_active_generation_delete() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.generation_runs where resource_id=old.id
    and resource_type=case when tg_table_name='sns_projects' then 'sns' else 'poster' end
    and state not in ('succeeded','failed','cancelled')) then raise exception 'generation_in_progress'; end if;
  return old;
end $$;
create trigger protect_active_sns_generation before delete on public.sns_projects for each row execute function public.protect_active_generation_delete();
create trigger protect_active_poster_generation before delete on public.poster_projects for each row execute function public.protect_active_generation_delete();
revoke all on function public.protect_active_generation_delete() from public,anon,authenticated;
commit;
