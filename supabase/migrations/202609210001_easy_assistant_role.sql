-- Easy 모드 대화에 **도우미가 한 말**을 남긴다.
--
-- 2026-09-21 사용자 — 「이지 모드 채팅창은 기본 LLM 이 탑재되어 꼭 이미지만이
-- 아니라 사용자와 AI 가 대화 할 수 있어야 합니다.」
--
-- 그전에는 갈래가 셋이었다 — user(내 말) · system(우리가 넣은 인사) ·
-- image(만든 그림). 도우미가 **말로 답한 줄**을 담을 자리가 없었다.
--
-- system 으로 대신 쓰지 않는다. 인사는 우리가 넣은 안내문이고 이것은 모델이 한
-- 말이라, 한 갈래에 섞으면 나중에 둘을 갈라낼 길이 없다.
--
-- 이 파일은 **앱 배포보다 먼저** 돌려야 한다. 순서가 반대면 그 사이의 대화가
-- 전부 저장에 실패한다(docs/DEPLOY.md 「표부터 고치고 배포한다」).

alter table public.easy_messages
  drop constraint if exists easy_messages_role_check;

alter table public.easy_messages
  add constraint easy_messages_role_check
  check (role in ('user', 'system', 'image', 'assistant'));
