-- ════════════════════════════════════════════════════════════════════
--  이미지 만들기·카드뉴스를 사용량 장부에 들인다
--
--  **지금까지 이 둘은 장부에 한 줄도 없었다.**
--
--  2026-09-08 운영 확인:
--    poster_generation_requests   19건 · $5.641   ← 진짜 쓴 돈
--    sns_generation_requests      20건 · $3.315   ← 진짜 쓴 돈
--    generation_events (장부)     23건 · pdp_image 19 · pdp_analyze 4
--                                        ↑ 포스터·카드뉴스 0건
--
--  약 $8.96 이 장부 밖에 있었다. 개인 한도에도 안 걸리고 팀 크레딧에서도
--  안 빠졌다.
--
--  뿌리는 이 check 였다 — 애초에 넣을 수 있는 값에 없었다.
--
--  하는 일: 제약 하나를 넓힌다. 기존 행은 건드리지 않는다.
--    - 여러 번 돌려도 안전하다
--    - 되돌리려면 예전 목록으로 다시 걸면 된다 (단, 새 값이 든 행이 있으면 막힌다)
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌면 예약이 23514 로 실패하고 사용자는 「사용량을 확인하지
--        못했습니다」만 본다.
-- ════════════════════════════════════════════════════════════════════

alter table public.generation_events
  drop constraint if exists generation_events_operation_check;

alter table public.generation_events
  add constraint generation_events_operation_check
  check (operation in (
    'pdp_analyze',
    'pdp_image',
    'redesign_generate',
    'redesign_edit',
    -- 이미지 만들기 (/poster). 변형 장수만큼 예약하고 받은 만큼 확정한다.
    'poster_image',
    -- 카드뉴스 (/sns).
    'sns_image'
  ));

-- 확인:
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.generation_events'::regclass
--     and conname = 'generation_events_operation_check';
