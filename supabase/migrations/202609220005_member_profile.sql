-- 회원 이름·추천인. 2026-09-22 사용자 결정(설계 docs/superpowers/specs/2026-09-22-account-cardnews-team-review.md §3.4):
--
--   · 가입할 때 받는 것은 이름·이메일·비밀번호·추천인 넷뿐이다.
--   · 넷 다 계정 화면에서 고칠 수 있다. 관리자 화면에서도 보고 찾는다.
--   · 추천인은 **검증하지 않는 입력란**이다. 코드든 이름이든 적은 그대로 담는다 —
--     제도(코드 발급·보상)를 만드는 날 이 값이 원자료가 된다. 그날 이 칸 수정을 잠근다.
--     안 잠그면 보상을 받은 뒤 추천인을 바꿀 수 있다.
--
-- 칸을 더하기만 한다. 옛 코드는 이 칸을 안 읽으므로 **배포보다 먼저 돌려도 된다**
-- (새 코드는 이 칸을 읽으므로 먼저 돌려야 한다).

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists referrer_input text;

-- 가입 메타데이터에서 한 줄로 다듬는다. 빈칸은 null — 빈 문자열과 null 이 섞이면 나중에 집계가 갈린다.
-- 길면 자른다. 거절하면 가입 자체가 막힌다.
create or replace function public.profile_text(p_value text, p_limit integer) returns text language sql immutable
as $$ select nullif(btrim(left(btrim(regexp_replace(coalesce(p_value,''),'\s+',' ','g')), p_limit)), '') $$;

-- 202607290001 의 정의를 그대로 옮기고 이름·추천인 두 칸만 더했다.
--
-- **고친 값을 되돌리지 않는다.** 이 트리거는 이메일 인증·이메일 변경 때도 돈다. 그때
-- 가입 메타데이터 값으로 덮으면 계정 화면에서 고친 이름이 가입 때 이름으로 돌아간다.
-- 그래서 이미 있는 값이 먼저다(coalesce(profiles.…, excluded.…)).
--
-- 가입 뒤 서버에서 따로 update 하지 않고 트리거로 넣는 까닭: 가입 직후 통신이 끊겨도
-- 이름이 빠지지 않는다. 계정이 만들어지는 그 한 번에 같이 들어간다.
create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, email_confirmed_at, status, approved_at, display_name, referrer_input)
  values (
    new.id,
    coalesce(new.email, ''),
    new.email_confirmed_at,
    case when new.email_confirmed_at is not null then 'active' else 'pending' end,
    case when new.email_confirmed_at is not null then now() else null end,
    public.profile_text(new.raw_user_meta_data->>'display_name', 40),
    public.profile_text(new.raw_user_meta_data->>'referrer_input', 100)
  )
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at,
        -- 인증을 마쳤고 아직 대기 중이면 활성으로. 정지된 계정은 그대로 둔다.
        status = case
          when excluded.email_confirmed_at is not null and public.profiles.status = 'pending'
            then 'active'
          else public.profiles.status
        end,
        approved_at = case
          when excluded.email_confirmed_at is not null and public.profiles.status = 'pending'
            then now()
          else public.profiles.approved_at
        end,
        display_name = coalesce(public.profiles.display_name, excluded.display_name),
        referrer_input = coalesce(public.profiles.referrer_input, excluded.referrer_input),
        updated_at = now();
  return new;
end;
$$;

-- 이 파일을 돌리기 전에 가입한 사람은 이름·추천인이 가입 메타데이터에만 있다. 옮겨 온다.
update public.profiles p set
  display_name = coalesce(p.display_name, public.profile_text(u.raw_user_meta_data->>'display_name', 40)),
  referrer_input = coalesce(p.referrer_input, public.profile_text(u.raw_user_meta_data->>'referrer_input', 100))
from auth.users u
where u.id = p.id and (p.display_name is null or p.referrer_input is null);

-- 관리자 회원 목록. 202609220003 의 정의를 그대로 옮기고 이름·추천인을 싣고 찾게 했다.
create or replace function public.credit_admin_members(p_actor uuid,p_query text default '',p_status text default '',p_team uuid default null,p_balance text default '',p_expiring boolean default false,p_sort text default 'created',p_direction text default 'desc',p_limit integer default 50,p_offset integer default 0,p_plan text default '',p_review boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
  -- 검색어의 % _ \ 는 글자로 찾는다. 「%」 하나로 전원이 나오면 안 된다.
  v_like text := '%'||replace(replace(replace(coalesce(p_query,''),'\','\\'),'%','\%'),'_','\_')||'%';
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
    select p.id,p.email,p.display_name,p.referrer_input,p.role,p.status,p.created_at,p.monthly_quota,tm.team_id,t.name team_name,
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
    where (p_query='' or p.email ilike v_like escape '\' or p.display_name ilike v_like escape '\' or p.referrer_input ilike v_like escape '\') and (p_status='' or p.status=p_status) and (p_team is null or tm.team_id=p_team) and (p_plan='' or s.plan_id=p_plan)
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

do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'credit\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;
revoke all on function public.profile_text(text,integer) from public,anon,authenticated;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--   1. sync_auth_user_profile 을 202607290001 의 정의로 되돌린다
--   2. credit_admin_members 를 202609220003 의 정의로 되돌린다
--   3. 칸은 지우지 않아도 된다(옛 코드는 안 읽는다). 지우면 받은 이름·추천인이 사라진다.
