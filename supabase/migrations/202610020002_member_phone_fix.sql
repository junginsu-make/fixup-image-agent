-- 회원 전화번호(선택) 보정. 2026-10-02 독립 리뷰가 찾은 것을 고친다.
--
--   H1  이메일 가입 때 적은 번호가 인증 정보(auth.users.raw_user_meta_data)에 사본으로
--       남았다. 회원이 번호를 지우거나 탈퇴해도 그 사본은 남아 처리방침의 「지우면 바로
--       삭제」와 어긋난다. → 번호를 인증 정보에 **저장하기 전에** 빼내 프로필로만 옮긴다.
--   M1  형식 함수 실행 권한을 거둬, 함수 권한이 없는 다른 역할의 profiles 쓰기가 모두
--       막힐 수 있었다(이 DB 는 다른 서비스와 같이 쓴다). → 권한을 되돌린다.
--   M3  가입 정보의 `phone`·`phone_consent` 는 다른 서비스도 쓸 수 있는 흔한 이름이다.
--       → 이 서비스 전용 이름 `fixup_phone`·`fixup_phone_consent` 만 읽고 지운다.
--
-- 202610020001 다음에 돌린다. 지금 도는 앱은 번호를 보내지 않으므로 배포보다 먼저 돌려도
-- 된다. 두 번 돌려도 같은 결과다. 기존 회원·잔액·다른 가입 정보는 건드리지 않는다.
begin;

-- M1. 글자 모양만 정리하는 함수다. 막아서 얻는 것이 없고, 표 제약이 쓰므로 막으면
-- 그 표를 쓰는 모든 역할이 실패한다.
grant execute on function public.profile_phone(text) to public;

-- H1·M3. 인증 계정이 만들어지거나 고쳐지는 순간, 이 서비스의 번호 키를 빼낸다.
--   · 추가(가입): 프로필은 뒤이은 가입 동기화(after insert)가 만든다. 그래서 번호를 이
--     트랜잭션에만 남는 설정값에 맡겨 두고, 프로필이 만들어지는 순간 옮긴다.
--     GoTrue 는 한 번에 한 명씩 넣는다. 한 문장으로 여러 명을 넣으면 마지막 사람 것만
--     남는다(id 를 대조하므로 남에게 옮겨지지는 않는다) — 그렇게 넣는 길은 지원하지 않는다.
--   · 고침: 키만 지우고 **번호는 저장하지 않는다.** 회원이 브라우저에서 인증 정보를 고치는
--     길은 앱의 동의 확인·상태 검사를 거치지 않는다. 번호는 계정 화면 한 곳에서만 저장한다.
--   동의(`fixup_phone_consent` = true)가 없거나 형식이 틀리면 옮기지 않는다. 어느 경우든
--   키는 지운다 — 인증 정보에 번호가 남지 않는다. 다른 키는 건드리지 않는다. 가입 정보가
--   객체가 아니면(다른 서비스의 값일 수 있다) 손대지 않는다.
create or replace function public.capture_signup_phone()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare v_phone text;
begin
  if new.raw_user_meta_data is null or jsonb_typeof(new.raw_user_meta_data) <> 'object'
     or not (new.raw_user_meta_data ?| array['fixup_phone', 'fixup_phone_consent']) then
    return new;
  end if;
  if tg_op = 'INSERT' and new.raw_user_meta_data ->> 'fixup_phone_consent' = 'true' then
    v_phone := public.profile_phone(new.raw_user_meta_data ->> 'fixup_phone');
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'fixup_phone' - 'fixup_phone_consent';
  if v_phone is not null then
    perform set_config('fixup.signup_phone', jsonb_build_object('id', new.id, 'phone', v_phone)::text, true);
  end if;
  return new;
end $$;
drop trigger if exists capture_signup_phone on auth.users;
create trigger capture_signup_phone before insert or update on auth.users
  for each row execute function public.capture_signup_phone();

-- 프로필이 처음 만들어질 때 위에서 맡겨 둔 번호를 옮긴다. 같은 회원(id)일 때만.
-- 202610020001 은 인증 정보를 직접 읽었다 — 그 길을 닫는다.
create or replace function public.profile_phone_from_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pending jsonb;
begin
  if new.phone is not null then return new; end if;
  v_pending := nullif(current_setting('fixup.signup_phone', true), '')::jsonb;
  if v_pending ->> 'id' = new.id::text then
    new.phone := public.profile_phone(v_pending ->> 'phone');
    new.phone_consented_at := case when new.phone is null then null else now() end;
    perform set_config('fixup.signup_phone', '', true);
  end if;
  return new;
end $$;

revoke all on function public.capture_signup_phone() from public, anon, authenticated;
revoke all on function public.profile_phone_from_signup() from public, anon, authenticated;
commit;

-- ── 확인 ─────────────────────────────────────────────────────────────
-- select count(*) from pg_trigger where tgname = 'capture_signup_phone';   → 1
-- select has_function_privilege('anon', 'public.profile_phone(text)', 'execute'); → true
-- select count(*) from auth.users where raw_user_meta_data ?| array['fixup_phone','fixup_phone_consent']; → 0
