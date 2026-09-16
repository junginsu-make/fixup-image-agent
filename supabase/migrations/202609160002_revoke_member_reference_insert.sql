-- 회원이 참고 이미지 표에 **직접** 넣는 권한을 거둔다.
--
-- `202608310003_references.sql` 이 회원(authenticated)에게 `id` 칸을 포함한
-- 넣기 권한을 열어 두었다. 그런데 **앱은 이 권한을 한 번도 쓰지 않는다** —
-- 참고 이미지는 전부 서버 권한으로 넣는다(`lib/reference-images.ts` 의
-- `saveReferenceImage`, 관리자 복사 `copyReferencesToSelf`). 2026-09-16 확인.
--
-- 열려 있으면 로그인한 회원이 브라우저의 공개 키와 세션으로 `/rest/v1/reference_images`
-- 에 **아무 id 로나** 자기 행을 넣을 수 있다. 두 가지가 문제였다.
--
--   1. 관리자 복사본 id 는 「원래 그림 + 복사한 사람」에서 정해져 누구나 계산할 수
--      있다. 그 id 를 먼저 차지해 두면 관리자의 복사가 남의 행을 재사용하려 했다
--      (코드에서도 막았다 — 주인과 경로가 맞을 때만 재사용한다)
--   2. 복사본은 id 형식(uuid 5)으로 가려 팀 이동에서 뺀다(`lib/reference-copy-id.ts`).
--      앱이 넣는 길은 uuid 4 만 받지만, 직접 넣는 길은 그 검사를 안 거친다
--
-- **배포 전후 언제 실행해도 안전하다.** 앱이 쓰지 않는 권한이라 거둬도 아무
-- 기능이 멈추지 않는다. 표 단위로 거두면 칸 단위 권한도 함께 사라진다.
--
-- 읽기·지우기·제목 고치기 권한은 그대로 둔다 — 그것은 앱이 쓴다.

revoke insert on public.reference_images from authenticated;
revoke insert on public.reference_images from anon;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- grant insert (id, user_id, storage_path, title, purpose, width, height)
--   on public.reference_images to authenticated;
