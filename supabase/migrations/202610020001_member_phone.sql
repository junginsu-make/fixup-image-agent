-- 회원 전화번호(선택). 2026-10-02 사용자 결정.
--
--   · 이메일 가입·간편가입(Google·카카오)·계정 화면에서 회원이 적는다. 선택 항목이다.
--   · 적으면 수집·이용 동의(선택)를 받아야 저장한다. 목적은 문의 응대와 서비스 운영
--     안내 연락이다. 동의 시각을 `phone_consented_at` 에 남긴다.
--   · 관리자는 관리자 화면에서 본다.
--
-- ── 더하기만 한다 ────────────────────────────────────────────────────
--
-- 칸 둘, 함수 셋, 트리거 둘. 기존 함수(sync_auth_user_profile,
-- complete_social_onboarding, member_withdraw)와 기존 행은 바꾸지 않는다.
-- 지금 도는 앱은 이 칸을 모르고 쓰지도 않으므로 **배포보다 먼저 돌려도 된다.**
-- 오히려 먼저 돌려야 한다 — 새 앱이 이 칸을 읽는다. 두 번 돌려도 같은 결과다.
begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists phone_consented_at timestamptz;

comment on column public.profiles.phone is
  '회원이 적은 전화번호(선택). public.profile_phone 형식. 동의가 있을 때만 찬다.';
comment on column public.profiles.phone_consented_at is
  '전화번호 수집·이용(선택)에 동의한 때. 번호를 지우면 함께 지운다.';

-- 형식 규칙. 앱의 lib/membership/phone.ts 와 같다 — 둘이 다르면 앱이 받은 번호를
-- 이 표가 거절한다(같은 예시 목록 phone-cases.json 을 두 시험이 함께 쓴다).
-- 받는 형식이면 하이픈을 넣은 꼴로, 아니면 null.
create or replace function public.profile_phone(p text)
returns text language sql immutable set search_path = public as $$
  select case
    when p is null or btrim(p) = '' or length(btrim(p)) > 20 or btrim(p) !~ '^[0-9 -]+$' then null
    else (select case
      when d ~ '^1[5-9][0-9]{6}$' then substr(d, 1, 4) || '-' || substr(d, 5)
      when d ~ '^010' then case when length(d) = 11 then substr(d, 1, 3) || '-' || substr(d, 4, 4) || '-' || right(d, 4) end
      when d ~ '^02[0-9]{7,8}$' then '02-' || substr(d, 3, length(d) - 6) || '-' || right(d, 4)
      when d ~ '^050[0-9]{8,9}$' then substr(d, 1, 4) || '-' || substr(d, 5, length(d) - 8) || '-' || right(d, 4)
      when d ~ '^0[0-9]{9,10}$' then substr(d, 1, 3) || '-' || substr(d, 4, length(d) - 7) || '-' || right(d, 4)
    end from (select regexp_replace(p, '[^0-9]', '', 'g') as d) digits)
  end
$$;

-- 번호는 정해진 꼴로만, 그리고 동의가 있을 때만 들어간다.
alter table public.profiles drop constraint if exists profiles_phone_valid;
alter table public.profiles add constraint profiles_phone_valid check (
  phone is null or (phone = public.profile_phone(phone) and phone_consented_at is not null)
);

-- 이메일 가입: 가입 정보(raw_user_meta_data)의 phone 을 phone_consent 가 true 일 때만
-- 옮긴다. 형식이 틀리면 **가입을 막지 않고** 번호만 버린다 — 선택 항목 때문에 가입이
-- 실패하면 안 된다. 가입 동기화 함수(sync_auth_user_profile)는 건드리지 않고, 프로필이
-- 처음 만들어지는 순간에 붙는다.
create or replace function public.profile_phone_from_signup()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_meta jsonb;
begin
  if new.phone is not null then return new; end if;
  select raw_user_meta_data into v_meta from auth.users where id = new.id;
  if v_meta ->> 'phone_consent' = 'true' then
    new.phone := public.profile_phone(v_meta ->> 'phone');
    new.phone_consented_at := case when new.phone is null then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists profile_phone_from_signup on public.profiles;
create trigger profile_phone_from_signup before insert on public.profiles
  for each row execute function public.profile_phone_from_signup();

-- 탈퇴(계정 닫기, member_withdraw)는 이름처럼 번호와 동의 기록도 지운다. 닫힌 계정에는
-- 다시 넣을 수 없다. 탈퇴 함수는 건드리지 않는다.
create or replace function public.profile_phone_scrub_withdrawn()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'withdrawn' then
    new.phone := null;
    new.phone_consented_at := null;
  end if;
  return new;
end $$;
drop trigger if exists profile_phone_scrub_withdrawn on public.profiles;
create trigger profile_phone_scrub_withdrawn before update on public.profiles
  for each row execute function public.profile_phone_scrub_withdrawn();

-- 브라우저가 부를 일이 없다. 형식 함수는 표 제약이 쓰므로 서버 역할에는 남긴다.
revoke all on function public.profile_phone(text) from public, anon, authenticated;
grant execute on function public.profile_phone(text) to service_role;
revoke all on function public.profile_phone_from_signup() from public, anon, authenticated;
revoke all on function public.profile_phone_scrub_withdrawn() from public, anon, authenticated;
commit;

-- ── 확인 ─────────────────────────────────────────────────────────────
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name in ('phone', 'phone_consented_at');
--   → 두 줄
-- select public.profile_phone('01012345678');   → 010-1234-5678
