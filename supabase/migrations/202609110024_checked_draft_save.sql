begin;
-- A delayed AI response must not replace edits made while the provider ran.
-- Keep the existing RPC signature for other callers of this shared database.
create function public.save_sns_draft_checked(
  p_actor uuid,p_id uuid,p_flow jsonb,p_status text,p_expected_updated_at timestamptz
) returns void language plpgsql security definer set search_path=public as $$
declare current_updated_at timestamptz;
begin
  select updated_at into current_updated_at from public.sns_projects
    where id=p_id and user_id=p_actor for update;
  if not found then raise exception 'not_owner'; end if;
  if p_expected_updated_at is null or current_updated_at is distinct from p_expected_updated_at then
    raise exception 'draft_conflict';
  end if;
  perform public.save_sns_draft_v2(p_actor,p_id,p_flow,p_status);
end $$;
revoke all on function public.save_sns_draft_checked(uuid,uuid,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_sns_draft_checked(uuid,uuid,jsonb,text,timestamptz) to service_role;
commit;
