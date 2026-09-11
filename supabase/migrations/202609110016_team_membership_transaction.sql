begin;
create function public.change_team_membership_v2(p_actor uuid,p_target uuid,p_action text,p_team uuid default null,p_role text default 'member') returns void
language plpgsql security definer set search_path=public as $$
declare actor_admin boolean; actor_team uuid; actor_role text; old_team uuid; old_role text; target_team uuid; table_name text;
begin
  perform public.lock_usage_budget();
  select role='admin' into actor_admin from public.profiles where id=p_actor and status='active' and email_confirmed_at is not null;
  if not found then raise exception 'inactive_member'; end if;
  if p_action is null or p_action not in ('assign','remove','role') or p_role is null or p_role not in ('member','leader') then raise exception 'invalid_membership_change'; end if;
  select team_id,role into actor_team,actor_role from public.team_members where user_id=p_actor;
  select team_id,role into old_team,old_role from public.team_members where user_id=p_target for update;
  if old_team is null and p_action='remove' then return; end if;
  if old_team is null and p_action='role' then raise exception 'membership_not_found'; end if;
  target_team := case when p_action='assign' then p_team else old_team end;
  if target_team is null then raise exception 'team_required'; end if;
  if not actor_admin and (actor_role is distinct from 'leader' or actor_team is distinct from target_team
      or (old_team is not null and old_team is distinct from target_team)) then raise exception 'team_write_denied'; end if;
  if old_role='leader' and (p_action='remove' or target_team is distinct from old_team or p_role='member')
    and (select count(*) from public.team_members where team_id=old_team and role='leader')<=1 then raise exception 'last_team_leader'; end if;
  if p_action='assign' and not exists(select 1 from public.teams where id=target_team and deleted_at is null) then raise exception 'team_not_found'; end if;
  if p_action='role' then
    update public.team_members set role=p_role where user_id=p_target;
  else
    if p_action='remove' then target_team:=null;
    else
      insert into public.team_members(user_id,team_id,role) values(p_target,target_team,p_role)
        on conflict(user_id) do update set team_id=excluded.team_id,role=excluded.role;
    end if;
    foreach table_name in array array['library_items','sns_projects','poster_projects','reference_images','reference_sets','characters'] loop
      execute format('update public.%I set team_id=$1 where user_id=$2 and (team_id is null or team_id=$3)',table_name)
        using target_team,p_target,old_team;
      if table_name in ('library_items','sns_projects','poster_projects') then
        execute format('update public.%I set project_id=null where user_id=$1 and project_id is not null and not exists (select 1 from public.projects f where f.id=%I.project_id and f.team_id=$2)',table_name,table_name)
          using p_target,target_team;
      end if;
    end loop;
    if p_action='remove' then delete from public.team_members where user_id=p_target; end if;
  end if;
  -- generation_events and generation_runs keep their original team snapshot.
  insert into public.usage_audit_events(actor_id,action,target_id,before_value,after_value,reason)
    values(p_actor,'membership_'||p_action,p_target,jsonb_build_object('team',old_team,'role',old_role),jsonb_build_object('team',target_team,'role',p_role),'membership action');
end $$;
revoke all on function public.change_team_membership_v2(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.change_team_membership_v2(uuid,uuid,text,uuid,text) to service_role;

create function public.archive_team_v2(p_actor uuid,p_team uuid) returns void
language plpgsql security definer set search_path=public as $$
declare table_name text;
begin
  perform public.lock_usage_budget();
  if not exists(select 1 from public.profiles where id=p_actor and role='admin' and status='active' and email_confirmed_at is not null) then raise exception 'admin_required'; end if;
  perform 1 from public.teams where id=p_team for update;
  if not found then raise exception 'team_not_found'; end if;
  foreach table_name in array array['library_items','sns_projects','poster_projects','reference_images','reference_sets','characters'] loop
    execute format('update public.%I set team_id=null%s where team_id=$1 and user_id in (select user_id from public.team_members where team_id=$1)',table_name,
      case when table_name in ('library_items','sns_projects','poster_projects') then ',project_id=null' else '' end) using p_team;
  end loop;
  delete from public.team_members where team_id=p_team;
  update public.teams set deleted_at=coalesce(deleted_at,now()),updated_at=now() where id=p_team;
  insert into public.usage_audit_events(actor_id,action,target_id,reason) values(p_actor,'team_archive',p_team,'administrator archive');
end $$;
revoke all on function public.archive_team_v2(uuid,uuid) from public,anon,authenticated;
grant execute on function public.archive_team_v2(uuid,uuid) to service_role;
commit;
