-- 회원 삭제 계약만 복구한다. 202609220003 전체(전 회원 전환/관리자 지급)를 재실행하지 않는다.
-- 운영에서 확인한 차이: credit_accounts FK가 NO ACTION이고 사전 확인 함수가 없다.
-- 빈 계정만 자동 정리한다. 지급·구독·사용/정산 기록의 FK와 데이터는 변경하지 않는다.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.credit_accounts drop constraint if exists credit_accounts_user_id_fkey;
alter table public.credit_accounts add constraint credit_accounts_user_id_fkey
  foreign key(user_id) references public.profiles(id) on delete cascade;

create or replace function public.credit_member_has_records(p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.credit_grants where p_user in(user_id,granted_by,revoked_by))
    or exists(select 1 from public.user_subscriptions where user_id=p_user)
    or exists(select 1 from public.subscription_periods where p_user in(user_id,confirmed_by))
    or exists(select 1 from public.credit_holds where user_id=p_user)
    or exists(select 1 from public.credit_jobs where user_id=p_user)
    or exists(select 1 from public.credit_admin_events where actor_id=p_user)
$$;

revoke all on function public.credit_member_has_records(uuid) from public,anon,authenticated;
grant execute on function public.credit_member_has_records(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
