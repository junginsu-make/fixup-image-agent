-- 모든 회원을 크레딧 장부로 옮긴다. 2026-09-22 사용자 결정:
--
--   · 기존 회원도 신규 가입자도 **0 크레딧에서 시작한다.** 옛 월 한도를 환산해
--     넘기지 않는다 — 상용화 전이라 넘길 잔액이 없다. 옛 값은 legacy_snapshot 에 남긴다.
--   · 가입 혜택은 없다. 새로 가입하면 계정만 만들어지고 크레딧은 0 이다.
--   · 최고 관리자(role='admin')는 **무제한**이다.
--   · 크레딧·구독 지급과 회수는 /admin/members 에서 한다(202609220001 의 함수들).
--
-- ⚠ **이 파일을 돌리기 전에 서버의 CREDIT_LEDGER=1 이 먼저 켜져 있어야 한다.**
--   꺼진 채로 돌리면 앱이 옛 함수를 부르고, 202609220002 의 래퍼가 전환된 계정을
--   `credit_ledger_required` 로 막는다 — 전원이 아무것도 못 만든다.
--   켜기만 하고 이 파일을 안 돌린 상태는 안전하다(계정이 없으면 옛 길로 간다).
--
-- 여러 번 돌려도 같다. 이미 옮긴 계정·이미 준 무제한은 건너뛴다.

-- ── 무제한 ─────────────────────────────────────────────────────────
--
-- 무제한은 **따로 셈하는 길을 만들지 않는다.** 예약·확정·회수는 한 푼도 틀리면 안
-- 되는 곳이라, 거기에 「이 사람은 예외」 분기를 넣는 대신 다 쓸 수 없는 크기의
-- 추가 지급 한 덩어리를 준다(1억 크레딧, 2100년 만료). 그러면 관리자도 회원과
-- 똑같은 장부를 타고, 쓴 기록도 똑같이 남는다.
--
-- 화면이 1억을 그대로 보여 주면 안 되므로 「무제한」인지는 이 덩어리가 **살아
-- 있는지**로 판단한다. 따로 표시 칸을 두면 덩어리를 회수해도 「무제한」이라고
-- 거짓말을 하게 된다 — 회수하면 그 순간 무제한도 끝난다.
create or replace function public.credit_unlimited_source(p_user uuid) returns text language sql immutable
as $$ select 'unlimited:'||p_user::text $$;
create or replace function public.credit_is_unlimited(p_user uuid) returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from credit_grants where user_id=p_user and source_key=credit_unlimited_source(p_user) and revoked_at is null and expires_at>now()) $$;

-- ── 계정 만들기 ────────────────────────────────────────────────────
--
-- 0 에서 시작한다. 이번 달 옛 사용량도 새 단위로 옮기지 않는다(opening_used_units 0).
-- 옛 한도·사용량은 되돌릴 때를 위해 legacy_snapshot 에만 남긴다.
create or replace function public.credit_enroll(p_user uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; v_used integer;
begin
  perform credit_lock();
  select * into p from profiles where id=p_user;
  if not found then raise exception 'profile_not_found'; end if;
  if exists(select 1 from credit_accounts where user_id=p_user) then return false; end if;
  select coalesce(sum(consumed_units),0)::integer into v_used from generation_events where user_id=p_user and status='succeeded' and period_start=credit_period_start();
  insert into credit_accounts(user_id,opening_period,opening_used_units,legacy_snapshot,conversion_ratio)
    values(p_user,credit_period_start(),0,jsonb_build_object('quota',p.monthly_quota,'used',v_used,'remaining',greatest(0,p.monthly_quota-v_used),'reason','202609220003 전 회원 적용 · 0 에서 시작'),1);
  return true;
end $$;

-- 새로 가입하면 바로 계정을 만든다. 없으면 그 사람만 옛 월 한도를 공짜로 받는다.
create or replace function public.credit_enroll_new_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform credit_enroll(new.id);
  return new;
end $$;
drop trigger if exists credit_enroll_new_profile on public.profiles;
create trigger credit_enroll_new_profile after insert on public.profiles for each row execute function public.credit_enroll_new_profile();

-- 새로 만드는 팀도 새 장부다. 옛 값으로 두면 한도를 먼저 정한 팀에 회원을 넣는
-- 순간 `team_credit_policy_mismatch` 로 막힌다(credit_team_policy_guard).
alter table public.teams alter column credit_policy set default 'image-v2';

-- ── 잔액 · 회원 목록에 「무제한」을 싣는다 ────────────────────────
--
-- 202609220001 의 정의를 그대로 옮기고 `unlimited` 한 칸만 더했다.
create or replace function public.credit_wallet_state(p_user uuid) returns jsonb language sql stable security definer set search_path=public as $$
with lots as (
  select *, case when revoked_at is null and expires_at>now() then granted_units-consumed_units-reserved_units else 0 end as available
  from credit_grants where user_id=p_user
), sums as (
  select coalesce(sum(available),0)::integer as available,
    coalesce(sum(reserved_units),0)::integer as reserved,
    coalesce(sum(available) filter(where kind='subscription'),0)::integer as subscription_units,
    coalesce(sum(available) filter(where kind='purchase'),0)::integer as purchase_units,
    coalesce(sum(available) filter(where kind='bonus'),0)::integer as bonus_units,
    min(expires_at) filter(where available>0 and kind='subscription') as subscription_expires,
    min(expires_at) filter(where available>0 and kind='purchase') as purchase_expires,
    min(expires_at) filter(where available>0 and kind='bonus') as bonus_expires
  from lots
), used as (
  select coalesce(sum(consumed_units),0)::integer as amount from generation_events
  where user_id=p_user and pricing_policy='image-v2' and status='succeeded' and period_start=credit_period_start()
)
select jsonb_build_object('pricing_policy','image-v2','balance',s.available+s.reserved,'available',s.available,'reserved',s.reserved,
  'used',u.amount+case when a.opening_period=credit_period_start() then a.opening_used_units else 0 end,
  'subscription_units',s.subscription_units,'purchase_units',s.purchase_units,'bonus_units',s.bonus_units,
  'subscription_expires_at',s.subscription_expires,'purchase_expires_at',s.purchase_expires,'bonus_expires_at',s.bonus_expires,
  'period_start',credit_period_start(),'period_end',(credit_period_start()+interval '1 month')::date,
  'unlimited',credit_is_unlimited(p_user))
from sums s cross join used u join credit_accounts a on a.user_id=p_user;
$$;

create or replace function public.credit_admin_members(p_actor uuid,p_query text default '',p_status text default '',p_team uuid default null,p_balance text default '',p_expiring boolean default false,p_sort text default 'created',p_direction text default 'desc',p_limit integer default 50,p_offset integer default 0,p_plan text default '',p_review boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform credit_require_admin(p_actor);
  if p_sort not in ('created','email','balance','used','expires') or p_direction not in ('asc','desc') or p_limit not between 1 and 500 or p_offset<0 then raise exception 'invalid_member_query'; end if;
  with lots as (
    select user_id,
      coalesce(sum(granted_units-consumed_units-reserved_units) filter(where revoked_at is null and expires_at>now()),0)::integer available,
      coalesce(sum(reserved_units),0)::integer reserved,
      min(expires_at) filter(where revoked_at is null and expires_at>now() and granted_units-consumed_units-reserved_units>0) next_expires,
      bool_or(source_key=credit_unlimited_source(user_id) and revoked_at is null and expires_at>now()) unlimited
    from credit_grants group by user_id
  ), pending as (
    select pp.user_id,sum(pp.units)::integer units,min(pp.expires_at) expires
    from subscription_periods pp left join credit_grants g on g.period_id=pp.id
    where g.id is null and pp.starts_at<=now() and pp.expires_at>now() group by pp.user_id
  ), review as (
    select user_id,coalesce(sum(requested_units),0)::integer units from generation_events
    where pricing_policy='image-v2' and status='reserved' and credit_phase='needs_review' group by user_id
  ), usage as (
    select user_id,pricing_policy,
      coalesce(sum(consumed_units) filter(where status='succeeded'),0)::integer used,
      coalesce(sum(requested_units) filter(where status='reserved' and (pricing_policy='image-v2' or expires_at>now())),0)::integer reserved
    from generation_events where period_start=credit_period_start() group by user_id,pricing_policy
  ), members as (
    select p.id,p.email,p.role,p.status,p.created_at,p.monthly_quota,tm.team_id,t.name team_name,
      case when a.user_id is null then 'cost-v1' else 'image-v2' end pricing_policy,
      case when a.user_id is null then greatest(0,p.monthly_quota-coalesce(u.used,0)-coalesce(u.reserved,0)) else coalesce(l.available,0)+coalesce(pg.units,0) end available,
      case when a.user_id is null then coalesce(u.reserved,0) else coalesce(l.reserved,0) end reserved,
      coalesce(u.used,0)+case when a.opening_period=credit_period_start() then a.opening_used_units else 0 end used,
      least(l.next_expires,pg.expires) next_expires,s.plan_id,s.status subscription_status,coalesce(rv.units,0) review_units,
      coalesce(l.unlimited,false) unlimited
    from profiles p left join credit_accounts a on a.user_id=p.id
    left join usage u on u.user_id=p.id and u.pricing_policy=case when a.user_id is null then 'cost-v1' else 'image-v2' end
    left join lots l on l.user_id=p.id left join pending pg on pg.user_id=p.id left join review rv on rv.user_id=p.id
    left join team_members tm on tm.user_id=p.id left join teams t on t.id=tm.team_id
    left join user_subscriptions s on s.user_id=p.id
    where (p_query='' or p.email ilike '%'||p_query||'%') and (p_status='' or p.status=p_status) and (p_team is null or tm.team_id=p_team) and (p_plan='' or s.plan_id=p_plan)
  ), filtered as (
    select * from members where
      (p_balance='' or (p_balance='zero' and available=0) or (p_balance='low' and available between 1 and 10) or (p_balance='enough' and available>10))
      and (not p_expiring or next_expires<=now()+interval '7 days')
      and (not p_review or review_units>0)
  ), selected as (
    select * from filtered order by
      case when p_sort='created' and p_direction='asc' then created_at end asc,
      case when p_sort='created' and p_direction='desc' then created_at end desc,
      case when p_sort='email' and p_direction='asc' then email end asc,
      case when p_sort='email' and p_direction='desc' then email end desc,
      case when p_sort='balance' and p_direction='asc' then available end asc,
      case when p_sort='balance' and p_direction='desc' then available end desc,
      case when p_sort='used' and p_direction='asc' then used end asc,
      case when p_sort='used' and p_direction='desc' then used end desc,
      case when p_sort='expires' and p_direction='asc' then next_expires end asc nulls last,
      case when p_sort='expires' and p_direction='desc' then next_expires end desc nulls last,id
    limit p_limit offset p_offset
  ) select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce(jsonb_agg(to_jsonb(selected)),'[]'::jsonb)) into result from selected;
  return result;
end $$;

-- 팀 화면도 같다. 무제한 관리자의 「잔액+사용」은 1억이라 그대로 보여 주면 안 된다.
create or replace function public.credit_team_state(p_team uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t teams%rowtype; member_id uuid; result jsonb; total integer;
begin
  perform credit_lock(); select * into t from teams where id=p_team;
  if t.credit_policy is distinct from 'image-v2' then return null; end if;
  for member_id in select user_id from team_members where team_id=p_team loop perform credit_ensure_paid_period(member_id); end loop;
  select coalesce(sum(case when status='succeeded' then consumed_units when status='reserved' then requested_units else 0 end),0)::integer into total
    from generation_events where team_id=p_team and period_start=credit_period_start() and pricing_policy='image-v2';
  total:=total+case when t.credit_opening_period=credit_period_start() then t.credit_opening_used else 0 end;
  select jsonb_build_object('quota',t.monthly_quota,'teamUsed',total,'members',coalesce(jsonb_agg(jsonb_build_object(
    'userId',tm.user_id,'email',p.email,'role',tm.role,'used',(w.data->>'used')::integer+(w.data->>'reserved')::integer,
    'usedInTeam',coalesce((select sum(case when e.status='succeeded' then e.consumed_units when e.status='reserved' then e.requested_units else 0 end) from generation_events e where e.team_id=p_team and e.user_id=tm.user_id and e.period_start=credit_period_start() and e.pricing_policy='image-v2'),0),
    'personalQuota',(w.data->>'balance')::integer+(w.data->>'used')::integer,
    'unlimited',credit_is_unlimited(tm.user_id))), '[]'::jsonb)) into result
    from team_members tm join profiles p on p.id=tm.user_id cross join lateral(select credit_wallet_state(tm.user_id) data)w where tm.team_id=p_team;
  return result;
end $$;

-- ── 회원 삭제가 막히지 않게 ────────────────────────────────────────
--
-- 계정 행(credit_accounts)은 돈을 담지 않는다 — 잔액은 지급 덩어리(credit_grants)에
-- 있다. 그런데 profiles 를 참조하면서 on delete 규칙이 없어서, 전원을 옮긴 순간
-- 관리자가 회원을 지우면 「Database error deleting user」로 막힌다(독립 리뷰 실측).
-- 계정 행은 회원과 함께 사라져도 된다. **지급·구독 기록은 그대로 둔다** — 그런
-- 회원은 지우지 말고 정지한다(`apps/web/app/admin/actions.ts` 의 deleteMember 가 먼저 알려 준다).
alter table public.credit_accounts drop constraint if exists credit_accounts_user_id_fkey;
alter table public.credit_accounts add constraint credit_accounts_user_id_fkey
  foreign key(user_id) references public.profiles(id) on delete cascade;

-- 지우면 안 되는 기록이 있나. 있으면 삭제가 DB 에서 외래키로 막히므로 화면이 먼저
-- 「정지해 주세요」라고 말한다 — 「Database error deleting user」는 아무것도 안 알려 준다.
create or replace function public.credit_member_has_records(p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from credit_grants where p_user in(user_id,granted_by,revoked_by))
    or exists(select 1 from user_subscriptions where user_id=p_user)
    or exists(select 1 from subscription_periods where p_user in(user_id,confirmed_by))
    or exists(select 1 from credit_holds where user_id=p_user)
    or exists(select 1 from credit_jobs where user_id=p_user)
    or exists(select 1 from credit_admin_events where actor_id=p_user)
$$;

-- ── 옮기기 ─────────────────────────────────────────────────────────
do $$ declare v_user uuid; begin
  for v_user in select id from profiles order by id loop perform credit_enroll(v_user); end loop;
end $$;

-- 팀도 옮긴다. 구성원이 전부 옮겨진 팀만 — 지금은 전원이 옮겨졌으므로 모든 팀이다.
-- 팀 한도(monthly_quota)는 그대로 둔다. 0 은 「팀 한도 없음」이라 그대로가 맞고,
-- 0 이 아닌 값도 1:1 로 읽는다(회원을 0 에서 시작시키는 것과 같은 판단).
update public.teams t set credit_policy='image-v2',credit_opening_period=credit_period_start(),credit_opening_used=0
  where t.credit_policy<>'image-v2'
    and not exists(select 1 from team_members tm where tm.team_id=t.id
      and not exists(select 1 from credit_accounts a where a.user_id=tm.user_id));

-- 최고 관리자 무제한. 이미 받았으면 건너뛴다(source_key 가 사람마다 하나).
do $$ declare v_admin uuid; v_grant uuid; begin
  perform credit_lock();
  for v_admin in select id from profiles where role='admin' order by id loop
    insert into credit_grants(user_id,kind,granted_units,expires_at,source_key,paid_amount_krw,granted_by,reason)
      values(v_admin,'bonus',100000000,'2100-01-01 00:00:00+09',credit_unlimited_source(v_admin),0,v_admin,'최고 관리자 무제한')
      on conflict(source_key) do nothing returning id into v_grant;
    if v_grant is not null then
      insert into credit_admin_events(id,actor_id,action,target_ids,reason,input,result)
        values(gen_random_uuid(),v_admin,'unlimited',array[v_admin],'202609220003 최고 관리자 무제한',jsonb_build_object('units',100000000,'source','migration:202609220003'),jsonb_build_object('grant_id',v_grant));
    end if;
    v_grant:=null;
  end loop;
end $$;

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'credit\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

-- ── 결과 확인 ─────────────────────────────────────────────────────
-- Supabase SQL 편집기는 마지막 결과만 보여 준다. 여기서 바로 확인한다:
--   관리자 2명은 「무제한 true」, 나머지는 「사용 가능 0」, 「계정 없음」은 0명이어야 한다.
select p.email,p.role,p.status,
  a.user_id is not null as "계정 있음",
  credit_is_unlimited(p.id) as "무제한",
  coalesce((credit_wallet_state(p.id)->>'available')::integer,0) as "사용 가능"
from profiles p left join credit_accounts a on a.user_id=p.id
order by p.role, p.email;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- 되돌리려면 **CREDIT_LEDGER 를 끄기 전에** 이 순서로 한다. 거꾸로 하면 그 사이에
-- 전원이 `credit_ledger_required` 로 막힌다.
--
--   1. drop trigger if exists credit_enroll_new_profile on public.profiles;
--   2. alter table public.teams alter column credit_policy set default 'cost-v1';
--   3. 202609220001 의 「되돌리기」를 따른다 — 옛 한도는 legacy_snapshot 에 있다.
--
-- 관리자 무제한만 거두려면 /admin/members 에서 그 관리자의 「최고 관리자 무제한」
-- 지급을 회수한다. 따로 SQL 이 필요 없다.
--
-- ⚠ 무제한은 **역할(role)을 따라가지 않는다.** 이 파일을 돌린 그 순간의 관리자에게만
--   준다. 나중에 관리자를 새로 세우거나 내려도 저절로 주거나 거두지 않는다. 한 번
--   회수한 사람은 이 파일을 다시 돌려도 다시 받지 않는다(같은 source_key 가 남아 있다).
--   그럴 때는 회수 행을 되살린다:
--     update credit_grants set revoked_at=null,revoked_reason=null,revoked_by=null
--       where source_key='unlimited:<회원 id>';
--   새 관리자에게 주려면 위 「최고 관리자 무제한」 블록을 그대로 다시 돌리면 된다.
