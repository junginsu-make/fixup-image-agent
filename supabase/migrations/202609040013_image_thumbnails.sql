-- 목록에 거는 작은 사본.
--
-- 목록 화면은 지금 표지를 **원본 그대로** 내려받는다. 한 장이 2~4MB 이고
-- 라이브러리 목록은 200건까지 나오므로, 목록을 한 번 여는 데 수백 MB 가 오간다.
-- Storage 요금은 쌓아 두는 것보다 내보내는 것이 훨씬 비싸다.
--
-- 512px 사본은 30KB 안팎이다. 저장 공간은 1% 늘지만 전송량이 99% 줄어든다.
--
-- **원본과 별개 파일이다.** 원본은 손대지 않으므로 화질에는 아무 영향이 없고,
-- 잘못 만들어도 지우고 다시 만들면 그만이다.
--
-- 전부 null 을 허용한다. 이미 쌓인 행에는 사본이 없고, 없으면 화면이 예전처럼
-- 원본으로 떨어진다. 그래서 이 마이그레이션만 적용해도 아무것도 안 깨진다.

-- 라이브러리 — 목록이 가장 무겁다.
alter table public.library_images
  add column if not exists thumb_path text;

-- 목록 질의가 표 하나만 보게 한다. 여기에 없으면 200건마다 library_images 를
-- 다시 물어야 하는데, 목록은 가장 자주 열리는 화면이다.
alter table public.library_items
  add column if not exists cover_thumb_path text;

-- 아래 셋은 **아직 읽거나 쓰는 코드가 없다.** 자리만 미리 낸다.
--
-- 미리 내는 이유는 마이그레이션을 네 번 나눠 돌리는 것보다 한 번이 안전하기
-- 때문이다. 전부 null 을 허용하므로 코드가 붙기 전까지는 아무 일도 하지 않는다.
--
--   showcase_items — 첫 화면 갤러리. 로그인 없이 열려 전송량이 그대로 드러난다.
--   poster_images  — 결과 목록에 변형 세 장이 한꺼번에 깔린다.
--   sns_cards      — 카드 열 장 묶음이 목록에 깔린다.
alter table public.showcase_items
  add column if not exists thumb_path text;

alter table public.poster_images
  add column if not exists thumb_path text;

alter table public.sns_cards
  add column if not exists thumb_path text;
