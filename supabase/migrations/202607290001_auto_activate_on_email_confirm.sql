-- 이메일 인증을 마치면 바로 쓸 수 있게 한다.
--
-- 지금까지는 인증 뒤에도 관리자가 한 명씩 승인해야 했다. 운영자 키로 생성하는
-- 서비스라 문을 좁게 열어 둔 것인데, 그 문이 실제로는 **아무도 못 들어오는 문**이었다.
-- 가입자는 승인을 기다리다 떠나고, 관리자는 승인 요청이 온 줄도 모른다.
--
-- 대신 **기본 크레딧을 낮춘다.** 승인이 막던 것은 "낯선 사람이 우리 돈을 쓰는 것"인데,
-- 그건 승인 절차가 아니라 한도로 막는 편이 낫다. 자동 승인 + 월 5장이면
-- 100명이 가입해 다 써도 최악 $105 다(장당 $0.21 기준).
-- 더 필요한 회원은 관리자가 /admin 에서 한도를 올려 준다(0~10000).

-- ── 1. 기본 크레딧 30 → 5 ─────────────────────────────────────────
--
-- 이미 가입한 회원의 한도는 건드리지 않는다. 관리자가 정한 값일 수 있다.

alter table public.profiles
  alter column monthly_quota set default 5;

-- ── 2. 이메일 인증 시 자동 활성화 ─────────────────────────────────
--
-- 트리거가 원래 하던 일(프로필 동기화)은 그대로 두고, 인증이 확인된 순간
-- pending → active 로 올리는 것만 더한다.
--
-- suspended 는 올리지 않는다. 관리자가 내린 계정이 재인증으로 되살아나면
-- 정지가 무의미해진다.

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, email_confirmed_at, status, approved_at)
  values (
    new.id,
    coalesce(new.email, ''),
    new.email_confirmed_at,
    case when new.email_confirmed_at is not null then 'active' else 'pending' end,
    case when new.email_confirmed_at is not null then now() else null end
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
        updated_at = now();
  return new;
end;
$$;

-- 트리거 자체는 그대로다(after insert or update of email, email_confirmed_at).
-- 함수만 바뀌었으므로 재생성하지 않는다.

-- ── 3. 이미 인증을 마쳤는데 대기 중인 회원을 살린다 ───────────────
--
-- 승인 절차 때문에 묶여 있던 사람들이다. 자동 승인으로 바꾸는 김에 함께 푼다.

update public.profiles
set status = 'active',
    approved_at = coalesce(approved_at, now()),
    updated_at = now()
where status = 'pending'
  and email_confirmed_at is not null;
