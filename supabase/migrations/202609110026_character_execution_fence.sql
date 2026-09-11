begin;
-- PostgREST supplies these internal headers per request. They are set only by
-- the server adapter, never used as a substitute for RLS or the service key.
create function public.fence_character_generation_write() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  run_id uuid := nullif(headers->>'x-generation-run','')::uuid;
  token uuid := nullif(headers->>'x-generation-lease','')::uuid;
  row_data jsonb;
  owner_id uuid;
  character_id uuid;
  r public.generation_runs%rowtype;
begin
  row_data := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner_id := (row_data->>'user_id')::uuid;
  if tg_table_name='characters' then character_id := (row_data->>'id')::uuid;
  elsif tg_table_name='character_views' then character_id := (row_data->>'character_id')::uuid; end if;
  if run_id is not null then
    r := public.require_generation_lease(run_id,token);
    if r.user_id is distinct from owner_id or (tg_op='UPDATE' and (to_jsonb(old)->>'user_id')::uuid is distinct from r.user_id) then raise exception 'not_owner'; end if;
    if character_id is not null and character_id is distinct from r.resource_id and character_id is distinct from r.id then raise exception 'invalid_resource'; end if;
  elsif tg_op='DELETE' and character_id is not null and exists(
    select 1 from public.generation_runs g where g.user_id=owner_id and g.state not in ('succeeded','failed','cancelled')
      and ((g.resource_type='character' and g.resource_id=character_id) or g.id=character_id)
  ) then raise exception 'generation_active'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.fence_character_generation_write() from public,anon,authenticated;
create trigger characters_generation_fence before insert or update or delete on public.characters
  for each row execute function public.fence_character_generation_write();
create trigger character_views_generation_fence before insert or update or delete on public.character_views
  for each row execute function public.fence_character_generation_write();
create trigger character_references_generation_fence before insert or update or delete on public.reference_images
  for each row execute function public.fence_character_generation_write();
commit;
