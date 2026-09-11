begin;
-- Internal cached SDK/HTTP responses are not library images. They may include
-- intermediate images rejected by QA and must never be directly member-readable.
insert into storage.buckets(id,name,public) values('generation-internal','generation-internal',false) on conflict(id) do nothing;
create policy "generation internal is server only" on storage.objects as restrictive for all to anon,authenticated
  using(bucket_id<>'generation-internal') with check(bucket_id<>'generation-internal');

create function public.renew_generation_lease(p_id uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.generation_runs set lease_until=now()+interval '210 seconds',updated_at=now()
    where id=p_id and lease_token=p_token and state not in ('succeeded','failed','cancelled','needs_reconciliation');
  return found;
end $$;
revoke all on function public.renew_generation_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.renew_generation_lease(uuid,uuid) to service_role;
commit;
