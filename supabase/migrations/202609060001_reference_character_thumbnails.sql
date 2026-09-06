-- 참고 이미지·캐릭터 목록의 작은 사본 자리.
--
-- 앞선 작업(202609040013)에서 이 둘을 "수가 적다"고 보고 뺐다. 틀린 판단이었다 —
-- 참고 이미지는 **공용 창고**라 한 화면에 400장까지 뜬다. 지금 라이브러리에서
-- 가장 무거운 화면이다.
--
-- 하는 일: 표 두 개에 빈 칸을 하나씩 추가한다. 그게 전부다.
--   - 기존 데이터를 읽지도 고치지도 않는다
--   - 전부 비어 있어도 되므로 이것만 적용해도 아무것도 안 깨진다
--   - 여러 번 돌려도 안전하다
--
-- 순서: 이 SQL 을 먼저 → 그다음 코드 배포.

-- 참고 이미지. `storage_path` 에는 경로 형식 제약이 걸려 있지만 이 칸에는
-- 걸지 않는다 — 사본은 `{원본}.thumb.webp` 로 규칙이 다르다.
alter table public.reference_images
  add column if not exists thumb_path text;

-- 캐릭터 각도. 한 캐릭터에 세 장이라 목록에서 여러 캐릭터가 곱해진다.
alter table public.character_views
  add column if not exists thumb_path text;
