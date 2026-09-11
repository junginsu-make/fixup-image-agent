begin;
create function public.generation_asset_owner_visible(p_actor uuid,p_owner uuid,p_team uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select p_owner=p_actor or (p_team is not null and exists(select 1 from public.team_members where user_id=p_actor and team_id=p_team));
$$;
create function public.accessible_generation_asset_paths(p_actor uuid,p_paths text[]) returns table(path text)
language sql stable security definer set search_path=public as $$
  select distinct assets.path from (
    select r.storage_path as path from public.reference_images r
      where public.generation_asset_owner_visible(p_actor,r.user_id,r.team_id)
    union all
    select v.path from public.sns_cards c join public.sns_projects p on p.id=c.project_id
      cross join lateral (values(c.asset_path),(c.thumb_path))v(path)
      where public.generation_asset_owner_visible(p_actor,p.user_id,p.team_id)
        and starts_with(v.path,p.user_id::text||'/')
    union all
    select v.path from public.poster_images i join public.poster_projects p on p.id=i.project_id
      cross join lateral (values(i.asset_path),(i.thumb_path))v(path)
      where public.generation_asset_owner_visible(p_actor,p.user_id,p.team_id)
        and starts_with(v.path,p.user_id::text||'/')
    union all
    select v.path from public.library_images i join public.library_items p on p.id=i.item_id
      cross join lateral (values(i.path),(i.thumb_path))v(path)
      where public.generation_asset_owner_visible(p_actor,p.user_id,p.team_id)
        and starts_with(v.path,p.user_id::text||'/')
    union all
    select v.path from public.character_views i join public.characters p on p.id=i.character_id
      cross join lateral (values(i.path),(i.thumb_path))v(path)
      where public.generation_asset_owner_visible(p_actor,p.user_id,p.team_id)
        and starts_with(v.path,p.user_id::text||'/')
  )assets where assets.path=any(p_paths);
$$;
revoke all on function public.generation_asset_owner_visible(uuid,uuid,uuid),public.accessible_generation_asset_paths(uuid,text[]) from public,anon,authenticated;
grant execute on function public.accessible_generation_asset_paths(uuid,text[]) to service_role;
commit;
