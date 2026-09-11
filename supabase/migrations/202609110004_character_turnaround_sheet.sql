-- 캐릭터에 「다각도 한 장」 자리를 연다.
--
-- 여섯 각도를 한 그림 안에 3×2 로 담은 한 장이다. 각도를 낱장으로 여섯 개
-- 만들면 여섯 번 그리고 여섯 번 내는데, 한눈에 보려는 쓰임에는 한 장이면
-- 되고 그러면 한 장 값만 든다.
--
-- 각도가 아니라 **일곱 번째 항목**이다. 그래서 코드에서는 `CHARACTER_ANGLES`
-- 에 넣지 않는다 — 거기 넣으면 상세페이지가 섹션 참조로 여섯 컷짜리 격자를
-- 집어 가고, 그 격자가 결과물에 그대로 따라 나온다. 저장 자리만 같이 쓴다.
--
-- 하는 일: `character_views.angle` 의 허용 목록에 'sheet' 를 더한다. 그게 전부다.
--   - 기존 데이터를 읽지도 고치지도 않는다
--   - 여러 번 돌려도 안전하다
--   - 이것만 적용하고 코드를 안 올려도 아무것도 안 깨진다 (아무도 'sheet' 를 안 쓴다)
--
-- 순서: 이 SQL 을 먼저 → 그다음 코드 배포.

alter table public.character_views
  drop constraint if exists character_views_angle_check;

alter table public.character_views
  add constraint character_views_angle_check
    check (angle in ('front', 'left_45', 'right_45', 'left_90', 'right_90', 'back', 'sheet'));
