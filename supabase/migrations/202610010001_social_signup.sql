-- Social signup is identity verification, not a credit grant.
-- Requires 202609220003/0005 and the current credit ledger. Enable providers only
-- after this migration AND the onboarding-aware application are deployed.
begin;

alter table public.profiles
  add column if not exists signup_provider text,
  add column if not exists onboarding_required boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists signup_terms_version text,
  add column if not exists signup_terms_accepted_at timestamptz,
  add column if not exists signup_age_confirmed_at timestamptz;
alter table public.profiles drop constraint if exists profiles_social_signup_complete;
alter table public.profiles add constraint profiles_social_signup_complete check (
  (signup_provider is null or signup_provider in ('email','google','kakao'))
  and (onboarding_completed_at is null or (
    (status='withdrawn' or nullif(btrim(display_name),'') is not null)
    and nullif(btrim(signup_terms_version),'') is not null
    and signup_terms_accepted_at is not null and signup_age_confirmed_at is not null
  ))
);

-- Auth-owned app metadata chooses the provider. User metadata never grants
-- status, role, completion or credits. Existing identities keep their profile.
create or replace function public.sync_auth_user_profile()
returns trigger language plpgsql security definer set search_path=public,auth as $$
declare provider text := new.raw_app_meta_data->>'provider';
begin
  insert into public.profiles(id,email,email_confirmed_at,status,approved_at,display_name,referrer_input,signup_provider,onboarding_required)
  values(new.id,coalesce(new.email,''),new.email_confirmed_at,
    case when new.email_confirmed_at is not null then 'active' else 'pending' end,
    case when new.email_confirmed_at is not null then now() else null end,
    public.profile_text(new.raw_user_meta_data->>'display_name',40),
    public.profile_text(new.raw_user_meta_data->>'referrer_input',100),
    case when provider in ('google','kakao') then provider else 'email' end,
    coalesce(provider in ('google','kakao'),false))
  on conflict(id) do update set email=excluded.email,email_confirmed_at=excluded.email_confirmed_at,
    status=case when excluded.email_confirmed_at is not null and profiles.status='pending' then 'active' else profiles.status end,
    approved_at=case when excluded.email_confirmed_at is not null and profiles.status='pending' then now() else profiles.approved_at end,
    display_name=coalesce(profiles.display_name,excluded.display_name),
    referrer_input=coalesce(profiles.referrer_input,excluded.referrer_input),updated_at=now();
  return new;
end $$;

create or replace function public.complete_social_onboarding(p_user uuid,p_name text,p_referrer text,p_age boolean,p_terms boolean,p_version text)
returns void language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype;
  v_name text := btrim(regexp_replace(coalesce(p_name,''),'\s+',' ','g'));
  v_referrer text := btrim(regexp_replace(coalesce(p_referrer,''),'\s+',' ','g'));
begin
  -- Same lock order as financial changes; the lock is never held across I/O.
  perform credit_lock();
  select * into p from profiles where id=p_user for update;
  if not found or p.status<>'active' or p.email_confirmed_at is null or p.email='' then raise exception 'inactive_member'; end if;
  if not exists(select 1 from credit_accounts where user_id=p_user) then raise exception 'credit_account_not_activated'; end if;
  if not p.onboarding_required then raise exception 'onboarding_not_required'; end if;
  if p.onboarding_completed_at is not null then return; end if;
  if p_age is distinct from true or p_terms is distinct from true or p_version is distinct from '2026-10-01' then raise exception 'invalid_signup_consent'; end if;
  if length(v_name) not between 1 and 40 or length(v_referrer)>100 then raise exception 'invalid_profile'; end if;
  update profiles set display_name=v_name,referrer_input=nullif(v_referrer,''),
    signup_terms_version=p_version,signup_terms_accepted_at=now(),signup_age_confirmed_at=now(),
    onboarding_completed_at=now(),updated_at=now() where id=p_user;
end $$;

-- Restrictive policies compose with existing ownership/team policies. Profiles
-- remain readable so an unfinished member can resume onboarding. No recursive
-- profile policy, no new access to another member's rows, no change for guests.
create or replace function public.member_onboarding_complete()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=(select auth.uid())
    and (not onboarding_required or onboarding_completed_at is not null));
$$;
do $$ declare t record; begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relrowsecurity and c.relkind in ('r','p')
    and ((n.nspname='public' and c.relname<>'profiles') or (n.nspname='storage' and c.relname='objects')) loop
    execute format('drop policy if exists social_signup_complete on %I.%I',t.nspname,t.relname);
    execute format('create policy social_signup_complete on %I.%I as restrictive for all to authenticated using ((select public.member_onboarding_complete())) with check ((select public.member_onboarding_complete()))',t.nspname,t.relname);
  end loop;
end $$;

-- Service-role RPCs bypass RLS. Keep both manual/lazy grants and free AI event
-- creation behind completion without duplicating the financial RPC bodies.
create or replace function public.require_completed_signup_write()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from profiles where id=new.user_id and onboarding_required and onboarding_completed_at is null) then
    raise exception 'onboarding_required';
  end if;
  return new;
end $$;
drop trigger if exists require_completed_signup on public.credit_grants;
create trigger require_completed_signup before insert on public.credit_grants for each row execute function public.require_completed_signup_write();
drop trigger if exists require_completed_signup on public.subscription_periods;
create trigger require_completed_signup before insert on public.subscription_periods for each row execute function public.require_completed_signup_write();
drop trigger if exists require_completed_signup on public.generation_events;
create trigger require_completed_signup before insert on public.generation_events for each row execute function public.require_completed_signup_write();

revoke insert,update,delete on public.profiles from anon,authenticated;
revoke all on function public.sync_auth_user_profile() from public,anon,authenticated;
revoke all on function public.complete_social_onboarding(uuid,text,text,boolean,boolean,text) from public,anon,authenticated;
revoke all on function public.require_completed_signup_write() from public,anon,authenticated;
revoke all on function public.member_onboarding_complete() from public,anon;
grant execute on function public.member_onboarding_complete() to authenticated,service_role;
grant execute on function public.complete_social_onboarding(uuid,text,text,boolean,boolean,text) to service_role;
commit;

-- Do not roll back to an app that ignores onboarding after new social accounts
-- exist. Disable the affected provider and preserve accounts, grants and consent.
