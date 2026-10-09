-- 월 구독 배정 = 크레딧 지급, 매달 자동 (2026-10-09 사용자 결정).
--
--   1. 관리자가 배정하면 그 자리에서 플랜만큼 들어간다
--   2. 구독이 켜져 있는 동안 배정일을 기준으로 매달 자동으로 다시 들어간다 (「결제 확인」 없이)
--   3. 구독 크레딧은 배정한 날부터 한 달 쓴다 (그 달 말일 소멸이 아니다)
--   4. 다른 플랜으로 바꾸면 이전 플랜의 남은 크레딧은 거둬들이고 새 플랜 크레딧만 준다
--
-- 전에는 배정은 플랜만 붙이고, 관리자가 그 달 「결제 확인」(credit_admin_confirm_period)을
-- 눌러야 그 달 1일~말일 기간이 생겼다. 이제 기간은 `credit_subscription_cycle` 이 만든다.
-- 잔액을 읽거나 생성을 예약할 때(credit_ensure_paid_period) 불리므로 따로 도는 일정이 없다.
--
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱.** 옛 앱이 떠 있는 동안에도 배정하면 바로 지급되고
--   「결제 확인」 단추는 `subscription_auto_cycle` 로 거절된다(두 번 지급되지 않는다).
-- ⚠ 공유 DB — 별도 상세페이지 제품도 같은 지갑 함수(credit_ensure_paid_period)를 부른다.
--   이름·인자는 그대로 두었다. 구독이 있는 회원은 어느 제품에서 읽어도 같은 주기를 받는다.
-- 운영 2026-10-09: 구독 중인 회원 0명, 결제 기간 0줄 — 옮길 기록이 없다.

begin;
set local lock_timeout = '5s';

-- 자동 기간의 `confirmed_by`(필수)로 쓴다 — 배정한 관리자.
alter table public.user_subscriptions add column if not exists assigned_by uuid references public.profiles(id);

-- 기간은 이제 달력의 달이 아니라 배정일부터 한 달이다. 같은 날 플랜을 바꾸면 같은 날짜의
-- 기간이 둘 생기므로 「회원·달」 유일성 대신 「회원·시작 시각」 유일성을 둔다.
alter table public.subscription_periods drop constraint if exists subscription_periods_user_id_period_key;
create unique index if not exists subscription_periods_user_starts_idx on public.subscription_periods(user_id, starts_at);
-- 이름이 달라 위에서 못 지운 「회원·달」 유일성이 남아 있으면 여기서 멈춘다(같은 날 플랜을 바꾸면 조용히 지급이 빠진다).
do $$ begin
  if exists(select 1 from pg_constraint c where c.conrelid='public.subscription_periods'::regclass and c.contype='u'
            and (select array_agg(a.attname::text order by a.attname) from pg_attribute a
                 where a.attrelid=c.conrelid and a.attnum=any(c.conkey))=array['period','user_id']) then
    raise exception 'subscription_periods still has a unique (user_id, period) constraint under another name';
  end if;
end $$;

-- ── 주기 계산 ────────────────────────────────────────────────────
-- 몇 번째 주기인지 늘 **처음 시작 시각에서** 센다. 앞 주기 끝에서 다시 세면 1/31 → 2/28 → 3/28
-- 로 밀린다. 여기서는 1/31 → 2/28 → 3/31 이다(한국 시간, 월말은 그 달 마지막 날로 맞춘다).
create or replace function public.credit_subscription_cycle_bounds(p_started timestamptz, p_at timestamptz)
returns table(cycle integer, starts_at timestamptz, expires_at timestamptz)
language plpgsql stable set search_path=public as $$
declare
  v_start timestamp := p_started at time zone 'Asia/Seoul';
  v_now timestamp := p_at at time zone 'Asia/Seoul';
  n integer;
begin
  if p_started is null or p_at is null or p_at < p_started then return; end if;
  n := (extract(year from age(v_now, v_start)) * 12 + extract(month from age(v_now, v_start)))::integer;
  while n > 0 and v_start + make_interval(months => n) > v_now loop n := n - 1; end loop;
  while v_start + make_interval(months => n + 1) <= v_now loop n := n + 1; end loop;
  cycle := n;
  starts_at := (v_start + make_interval(months => n)) at time zone 'Asia/Seoul';
  expires_at := (v_start + make_interval(months => n + 1)) at time zone 'Asia/Seoul';
  return next;
end $$;

-- ── 지금 주기 하나를 만든다 ──────────────────────────────────────
-- 몇 달 안 들어온 회원에게도 **지금 주기 하나만** 만든다 — 지난 주기는 이미 끝나 쓸 수 없다.
-- 해지·중단이면 새 주기를 만들지 않는다. 이미 들어간 주기는 끝날 때까지 쓴다.
create or replace function public.credit_subscription_cycle(p_user uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s user_subscriptions%rowtype; p subscription_plans%rowtype; n integer; v_from timestamptz; v_until timestamptz;
begin
  perform credit_lock();
  select * into s from user_subscriptions where user_id = p_user;
  if not found or s.status <> 'active' or s.assigned_by is null then return; end if;
  -- 탈퇴·정지한 회원에게는 새 주기를 만들지 않는다(쓸 사람이 없는 기간과 금액이 장부에 쌓인다).
  -- 정지가 풀리면 그때 지금 주기를 받는다.
  if exists(select 1 from profiles where id = p_user and status in ('withdrawn', 'suspended')) then return; end if;
  select * into p from subscription_plans where id = s.plan_id;
  if not found or p.monthly_units < 1 then return; end if;
  select b.cycle, b.starts_at, b.expires_at into n, v_from, v_until from credit_subscription_cycle_bounds(s.started_at, now()) b;
  if n is null or (s.cancel_at is not null and v_from >= s.cancel_at) then return; end if;
  insert into subscription_periods(user_id, period, starts_at, expires_at, plan_id, units, paid_amount_krw, source_key, confirmed_by)
    values (p_user, (v_from at time zone 'Asia/Seoul')::date, v_from, v_until, s.plan_id, p.monthly_units, p.price_krw,
      'auto-cycle:' || p_user || ':' || floor(extract(epoch from s.started_at) * 1000000)::bigint || ':' || n, s.assigned_by)
    on conflict (source_key) do nothing;
end $$;

-- ── 남은 구독 크레딧 거둬들이기 (플랜 변경·다시 시작) ────────────────
-- 처리 중인 작업이 잡아 둔 크레딧이 있으면 바꾸지 않는다 — 회수 함수(credit_admin_revoke)와 같은 판단.
-- 이미 쓴 것은 쓴 대로 남는다. 남은 것만 쓸 수 없게 된다.
create or replace function public.credit_subscription_take_back(p_user uuid, p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock();
  -- 구독 기간에서 나온 lot 만 거둬들인다(period_id 있음). 관리자가 손으로 준 lot 는 플랜과 상관없다.
  if exists(select 1 from credit_grants where user_id = p_user and kind = 'subscription' and period_id is not null
            and revoked_at is null and expires_at > now() and reserved_units > 0) then
    raise exception 'credit_grant_has_holds';
  end if;
  with gone as (
    update credit_grants set revoked_at = now(), revoked_reason = '구독 변경 — 남은 구독 크레딧 회수', revoked_by = p_actor
    where user_id = p_user and kind = 'subscription' and period_id is not null and revoked_at is null and expires_at > now()
    returning id, granted_units - consumed_units as unused
  )
  insert into credit_admin_events(id, actor_id, action, target_ids, reason, input, result)
    select gen_random_uuid(), p_actor, 'revoke', array[p_user], '구독 변경 — 남은 구독 크레딧 회수',
      jsonb_build_object('grant_id', id), jsonb_build_object('unused', unused)
    from gone;
end $$;

-- ── 잔액을 읽을 때 지금 주기를 먼저 만든다 ─────────────────────────
create or replace function public.credit_ensure_paid_period(p_user uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.credit_lock();
  if not exists(select 1 from credit_accounts where user_id=p_user) then return; end if;
  perform public.credit_subscription_cycle(p_user);
  insert into credit_grants(user_id,kind,granted_units,granted_at,expires_at,period,period_id,source_key,paid_amount_krw,granted_by,reason)
    select p.user_id,'subscription',p.units,p.starts_at,p.expires_at,p.period,p.id,'paid-period:'||p.id,p.paid_amount_krw,p.confirmed_by,'확인된 구독 기간 지급'
    from subscription_periods p where p.user_id=p_user and p.starts_at<=now() and p.expires_at>now()
    on conflict(source_key) do nothing;
end $$;

-- ── 배정 ──────────────────────────────────────────────────────────
-- 같은 플랜을 다시 눌러도 시작 시각을 바꾸지 않는다 — 안 막으면 누를 때마다 크레딧이 또 나간다.
-- 새로 켜거나(처음·해지/중단 뒤) 플랜을 바꾸면 남은 구독 크레딧을 거둬들이고 지금부터 새 주기를 준다.
-- 해지·중단은 시작 시각을 그대로 두고 새 주기만 멈춘다.
--
-- **새 주기의 시작은 DB 시계(now())다**(독립 검토 2026-10-09). 앱 서버가 보낸 시각(p_started)을 쓰면
-- 앱 시계가 몇 초 빠를 때 첫 지급이 「아직 시작 전」으로 미뤄지고, 옛 시작 시각과 같으면 거둬들이기만
-- 하고 새 지급이 빠진다. 그래서 거둬들였는데 새 주기가 없으면 통째로 되돌린다(subscription_cycle_missing).
create or replace function public.credit_admin_subscription(p_user uuid,p_plan text,p_status text,p_started timestamptz,p_cancel timestamptz,p_actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s user_subscriptions%rowtype; v_start timestamptz := now();
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  if not exists(select 1 from credit_accounts where user_id=p_user) then raise exception 'credit_account_not_activated'; end if;
  if p_status not in ('active','canceled','suspended') or p_started is null then raise exception 'invalid_subscription'; end if;
  if not exists(select 1 from subscription_plans where id=p_plan and (active or p_status<>'active')) then raise exception 'inactive_subscription_plan'; end if;
  select * into s from user_subscriptions where user_id=p_user for update;
  if found and s.status='active' and p_status='active' and s.plan_id=p_plan then
    -- 이 칸이 생기기 전에 배정한 구독은 주기를 못 만든다. 같은 플랜을 다시 누르면 채운다(시작 시각은 그대로).
    if s.assigned_by is null then
      update user_subscriptions set assigned_by=p_actor, updated_at=now() where user_id=p_user;
      perform credit_ensure_paid_period(p_user);
    end if;
    return;
  end if;
  if p_status='active' then
    -- 아직 지급 lot 가 안 된 지금 기간까지 lot 로 만든 뒤 거둬들인다. 순서가 반대면 나중에 옛 기간이 지급된다.
    perform credit_ensure_paid_period(p_user);
    perform credit_subscription_take_back(p_user, p_actor);
  end if;
  insert into user_subscriptions(user_id,plan_id,status,started_at,cancel_at,assigned_by) values(p_user,p_plan,p_status,v_start,p_cancel,p_actor)
  on conflict(user_id) do update set plan_id=excluded.plan_id,status=excluded.status,
    started_at=case when excluded.status='active' then excluded.started_at else user_subscriptions.started_at end,
    cancel_at=excluded.cancel_at,
    assigned_by=case when excluded.status='active' then excluded.assigned_by else user_subscriptions.assigned_by end,
    updated_at=now();
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input) values(gen_random_uuid(),p_actor,'subscription',array[p_user],'구독 설정 변경',jsonb_build_object('plan',p_plan,'status',p_status,'started_at',v_start,'cancel_at',p_cancel));
  if p_status='active' then
    perform credit_ensure_paid_period(p_user);
    if exists(select 1 from subscription_plans where id=p_plan and monthly_units>0)
       and not exists(select 1 from profiles where id=p_user and status in ('withdrawn','suspended'))
       and not exists(select 1 from subscription_periods where user_id=p_user and starts_at=v_start) then
      raise exception 'subscription_cycle_missing';
    end if;
  end if;
end $$;

-- ── 수동 결제 확인은 닫는다 ─────────────────────────────────────────
-- 자동 주기와 겹치면 같은 기간이 두 번 지급된다. 이름·인자는 그대로 두어 옛 앱이 부르면 거절만 한다.
create or replace function public.credit_admin_confirm_period(p_user uuid,p_period date,p_paid integer,p_units integer,p_source text,p_actor uuid)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  raise exception 'subscription_auto_cycle';
end $$;

revoke all on function public.credit_subscription_cycle_bounds(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.credit_subscription_cycle(uuid) from public,anon,authenticated;
revoke all on function public.credit_subscription_take_back(uuid,uuid) from public,anon,authenticated;
grant execute on function public.credit_subscription_cycle_bounds(timestamptz,timestamptz) to service_role;
grant execute on function public.credit_subscription_cycle(uuid) to service_role;
grant execute on function public.credit_subscription_take_back(uuid,uuid) to service_role;
revoke all on function public.credit_ensure_paid_period(uuid) from public,anon,authenticated;
revoke all on function public.credit_admin_subscription(uuid,text,text,timestamptz,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.credit_admin_confirm_period(uuid,date,integer,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.credit_ensure_paid_period(uuid) to service_role;
grant execute on function public.credit_admin_subscription(uuid,text,text,timestamptz,timestamptz,uuid) to service_role;
grant execute on function public.credit_admin_confirm_period(uuid,date,integer,integer,text,uuid) to service_role;

notify pgrst, 'reload schema';
commit;

-- ── 되돌리기 ──────────────────────────────────────────────────────
-- 202609220001 의 credit_ensure_paid_period · credit_admin_subscription · credit_admin_confirm_period
-- 본문을 다시 실행하고, 새 함수 셋을 지운다:
--   drop function if exists public.credit_subscription_take_back(uuid,uuid);
--   drop function if exists public.credit_subscription_cycle(uuid);
--   drop function if exists public.credit_subscription_cycle_bounds(timestamptz,timestamptz);
-- 이미 지급된 주기와 lot 는 그대로 남는다(지우면 장부 파기다).
-- 「회원·달」 유일성은 같은 달에 기간이 둘 생긴 뒤에는 다시 걸 수 없다 — 그대로 둔다.
