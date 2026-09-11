begin;
-- The displayed quota is a ceiling over PERSONAL usage. Spending in an old
-- team must be added back to that ceiling before subtracting personal usage.
create or replace function public.effective_quota(p_user_id uuid,p_team_id uuid,p_personal_quota integer,p_period_start date)
returns integer language sql stable security definer set search_path=public as $$
  with outside_team as (
    select coalesce(sum(case when status='succeeded' then consumed_units else requested_units end),0)::integer amount
    from public.generation_events where user_id=p_user_id and period_start=p_period_start and team_id is distinct from p_team_id
      and (status='succeeded' or (status='reserved' and (protocol_version=2 or expires_at>now())))
  )
  select coalesce((select case when t.monthly_quota=0 then p_personal_quota else least(p_personal_quota,
    greatest(0,t.monthly_quota-public.team_units_used(p_team_id,p_period_start,p_user_id))+(select amount from outside_team)) end
    from public.teams t where t.id=p_team_id and t.deleted_at is null),p_personal_quota);
$$;

create function public.team_credit_state_v2(p_team uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  with amounts as (
    select user_id,team_id,case when status='succeeded' then consumed_units else requested_units end as amount
    from public.generation_events where period_start=date_trunc('month',now() at time zone 'Asia/Seoul')::date
      and (status='succeeded' or (status='reserved' and (protocol_version=2 or expires_at>now())))
  )
  select jsonb_build_object('quota',coalesce((select monthly_quota from public.teams where id=p_team),0),
    'teamUsed',(select coalesce(sum(amount),0) from amounts where team_id=p_team),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'email',p.email,'role',m.role,'personalQuota',p.monthly_quota,
      'used',(select coalesce(sum(amount),0) from amounts where user_id=m.user_id),
      'usedInTeam',(select coalesce(sum(amount),0) from amounts where user_id=m.user_id and team_id=p_team))),'[]'::jsonb)
      from public.team_members m join public.profiles p on p.id=m.user_id where m.team_id=p_team));
$$;
revoke all on function public.team_credit_state_v2(uuid) from public,anon,authenticated;
grant execute on function public.team_credit_state_v2(uuid) to service_role;
commit;
