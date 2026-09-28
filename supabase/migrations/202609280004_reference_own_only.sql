-- 참고 이미지는 올린 사람만 본다. 2026-09-28 사용자 결정:
--
--   > 참고 이미지도 사용자별로 구분 시켜주세요. 이 시스템에 팀 시스템이 있긴하지만,
--   > 그건 지금 사용하지 않을 계획입니다.
--
-- 유료로 공개하면 모르는 고객끼리 같은 창고를 쓰게 된다. 한 사람이 올린 제품
-- 사진·얼굴 사진이 다른 고객에게 보이면 안 된다. 관리자가 올린 것도 고객에게
-- 안 보인다(「완전히 내 것만」). 운영자는 서버 권한으로 읽어 이 정책을 안 탄다.
--
-- ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
-- 판정 함수 **본문만** 바꾼다. 정책 「team reads reference images」
-- (202609070006)는 이 함수를 부르므로 그대로 두면 된다. 이름·인자를 그대로 두는
-- 것도 그래서다 — 바꾸면 정책을 다시 만들어야 하고, 그 사이 읽기가 막힌다.
--
-- 전에는 팀이 안 붙은 것은 누구나, 팀에 묶인 것은 그 팀이 봤다. 이제 `team_id`
-- 는 보는 범위를 넓히지 않는다. 팀 기능을 다시 켜서 공유가 필요해지면 그때 이
-- 함수와 앱의 `lib/teams/reference-scope.ts` 를 함께 바꾼다.
--
-- 이미 적용된 202609070006 을 고치지 않고 새 파일로 덮는다. 적용된 파일을 나중에
-- 고치면 운영과 저장소가 갈린다(2026-09-28 크레딧 예약 장애의 원인).
--
-- 고치고 지우는 정책(「members manage own reference images」)과 세트 항목 정책은
-- 안 건드린다. 둘 다 이미 올린 사람·세트 주인만이다.
--
-- `security invoker` 로 바꾼다. 전에는 회원에게 막힌 `team_members` 를 읽느라
-- 소유자 권한이 필요했다. 이제 `auth.uid()` 만 보므로 묻는 사람 권한으로 돌면 된다 —
-- 권한이 좁을수록 실수했을 때 새는 것이 적다.
--
-- 여러 번 돌려도 같다.

create or replace function public.reference_visible(row_team_id uuid, row_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  -- 팀 칸은 받기만 하고 쓰지 않는다. 정책이 두 인자로 부른다.
  select row_user_id = (select auth.uid());
$$;

revoke all on function public.reference_visible(uuid, uuid) from public, anon;
grant execute on function public.reference_visible(uuid, uuid) to authenticated;

-- ── 확인 ──────────────────────────────────────────────────────────
--
--   select pg_get_functiondef('public.reference_visible(uuid,uuid)'::regprocedure);
--   -- 본문이 `row_user_id = (select auth.uid())` 한 줄이어야 한다.
--
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'reference_images' order by policyname;
--   -- **정확히 두 줄**이어야 한다. 운영은 콘솔에 손으로 붙여 적용해 와서 저장소와
--   -- 갈린 적이 있다. 옛 「members read all reference images」(using true) 처럼
--   -- 다른 select 정책이 하나라도 남아 있으면 OR 로 합쳐져 이 파일의 효과가 없다.
--     members manage own reference images   ALL     (auth.uid() = user_id)
--     team reads reference images           SELECT  reference_visible(team_id, user_id)
--
-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- 202609070006_reference_team_scope.sql 의 `create or replace function
-- public.reference_visible` 블록을 다시 실행한다.
