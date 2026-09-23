-- 회원 탈퇴. 2026-09-23 사용자 결정
-- (설계 docs/superpowers/specs/2026-09-23-cs-ai-bot-design.md §11):
--
--   · 모든 사용자는 계정(개인페이지)에서 스스로 탈퇴할 수 있다.
--   · 그런데 **돈 기록이 있는 회원은 지울 수 없다**(202609220003 의
--     `credit_member_has_records`). 「돈 기록은 회원과 함께 지우지 않는다」는
--     그때의 결정이고, 이번에 뒤집지 않는다.
--
-- 그래서 탈퇴는 두 갈래다.
--
--   A. 돈 기록 없음 → 인증 계정까지 지운다(앱이 `auth.admin.deleteUser`).
--                      `profiles` 는 `auth.users` 를 참조하므로 함께 사라진다.
--   B. 돈 기록 있음 → **계정을 닫는다.** 로그인을 막고 개인정보를 지우되
--                      돈 기록은 남긴다. 그것이 이 파일이 여는 길이다.
--
-- ── 왜 `suspended` 를 재사용하지 않나 ────────────────────────────────
--
-- 정지는 **운영자가 막은 것**이고 탈퇴는 **본인이 떠난 것**이다. 같은 값을
-- 쓰면 관리자 화면에서 둘을 구분할 수 없고, 정지를 푸는 순간 **탈퇴한 계정이
-- 되살아난다.** 값을 나눈다.
--
-- ── 칸을 더하기만 한다 ───────────────────────────────────────────────
--
-- 기존 행은 하나도 안 건드린다. 옛 코드는 `withdrawn` 을 만들지 않으므로
-- **배포보다 먼저 돌려도 된다.** 오히려 먼저 돌려야 한다 — 새 코드가 이
-- 값을 쓴다.

-- ── 1. 상태 값 하나를 더 받는다 ──────────────────────────────────────
--
-- 제약 이름은 Postgres 가 붙인 기본값(`profiles_status_check`)이다. 먼저
-- 떨어뜨리고 다시 건다. 두 번 돌려도 같은 결과다.

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('pending', 'active', 'suspended', 'withdrawn'));

-- ── 2. 언제 떠났는지 남긴다 ──────────────────────────────────────────
--
-- 돈 기록은 남기기로 했으므로, 그 기록이 **언제 닫힌 계정의 것인지** 알
-- 수 있어야 한다. 보관 기간을 세는 기준도 이 값이다.

alter table public.profiles
  add column if not exists withdrawn_at timestamptz;

comment on column public.profiles.withdrawn_at is
  '본인이 탈퇴한 때. 계정을 닫기만 한 경우(돈 기록이 있어 못 지운 경우)에 찬다.';

-- 관리자 화면이 탈퇴한 회원을 따로 볼 수 있게 한다. 부분 색인이라 가볍다.
create index if not exists profiles_withdrawn_idx
  on public.profiles (withdrawn_at desc)
  where withdrawn_at is not null;

-- ── 3. 계정을 닫는다 ─────────────────────────────────────────────────
--
-- **한 번에 한다.** 상태만 바꾸고 이름을 못 지운 채로 끝나면, 로그인은
-- 막혔는데 개인정보는 남은 상태가 된다.
--
-- **부르는 사람이 곧 떠나는 사람이다.** 남의 계정을 닫는 길을 안 만든다 —
-- 관리자가 회원을 내리는 길은 이미 따로 있다(정지·삭제).
--
-- 돈 기록이 **없는** 회원이 여기로 오면 막는다. 그 사람은 완전히 지워야
-- 하고, 지우는 일은 앱이 인증 API 로 한다.

create or replace function public.member_withdraw(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.profiles where id = p_user for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_status = 'withdrawn' then return; end if;

  /*
    **처리 중인 작업이 있으면 닫지 않는다.** 크레딧이 잡혀 있다는 것은 지금
    만들고 있다는 뜻이다. 그 사이에 계정을 닫으면 결과가 갈 곳이 없어진다.

    **잡힌 수는 `credit_grants.reserved_units` 가 든다** — `credit_summary`
    가 화면에 「처리 중」으로 보여 주는 그 값이다. 두 벌로 세지 않는다.
  */
  if exists (
    select 1 from public.credit_grants
    where user_id = p_user and reserved_units > 0
  ) then
    raise exception 'work_in_progress';
  end if;

  update public.profiles
     set status = 'withdrawn',
         withdrawn_at = now(),
         -- 개인정보를 지운다. 이메일은 `auth.users` 가 들고 있고 그것은
         -- 돈 기록의 주인을 가리키므로 여기서 건드리지 않는다.
         display_name = null,
         referrer_input = null,
         updated_at = now()
   where id = p_user;
end $$;

comment on function public.member_withdraw(uuid) is
  '본인이 계정을 닫는다. 돈 기록이 있어 지울 수 없는 회원용(설계 §11.3).';

-- 브라우저가 직접 부르지 못하게 한다. 서버(관리 키)만 부른다 —
-- 누가 떠나는지는 세션이 정해야 하고, 그 판단은 앱에 있다.
revoke all on function public.member_withdraw(uuid) from public, anon, authenticated;

-- ── 확인 ─────────────────────────────────────────────────────────────
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint where conname = 'profiles_status_check';
--   → check (status = any (array['pending','active','suspended','withdrawn']))
--
-- select column_name from information_schema.columns
--   where table_name = 'profiles' and column_name = 'withdrawn_at';
--   → withdrawn_at
