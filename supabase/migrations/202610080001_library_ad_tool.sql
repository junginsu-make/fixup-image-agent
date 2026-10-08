-- 광고소재 결과를 라이브러리에 **한 묶음으로** 남긴다(2026-10-08 사용자 요청).
--
-- **이 마이그레이션을 앱보다 먼저 적용한다.** 순서가 반대면 새 앱이 `tool = 'ad'` 로
-- 쓰려다 check 제약에 걸려 광고 결과 저장이 전부 실패한다. 내보내기 결과는 그래도
-- 화면에 나오지만(저장 실패는 안내만 한다) 라이브러리에는 안 남는다.
--
-- 전에는 광고 내보내기가 결과를 응답으로만 주고 어디에도 저장하지 않아, 창을 닫으면
-- 내려받은 ZIP 말고는 남는 것이 없었다. 라이브러리의 「광고소재」 단추는 늘 비어
-- "아직 저장되지 않습니다" 안내만 띄웠다.
--
-- 제약 이름은 `202607280001_server_library.sql` 의 열 check 가 받은 기본 이름이다.
alter table public.library_items
  drop constraint if exists library_items_tool_check;
alter table public.library_items
  add constraint library_items_tool_check check (tool in ('create', 'redesign', 'ad'));
