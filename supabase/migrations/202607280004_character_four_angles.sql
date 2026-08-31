-- 캐릭터 각도를 앞·좌·우·뒤 넷으로 바꾼다.
--
-- 처음에는 정면·45도·뒷모습 셋이었다. 45도 하나만으로는 인물이 늘 같은 쪽을
-- 보고 서 있어, 글자를 앉힐 여백을 반대쪽에 두고 싶을 때 쓸 것이 없었다.
--
-- 좌·우는 90도 측면이 아니라 45도로 돌린 시점이다. 90도는 얼굴이 반만 보여
-- 섹션 생성의 정체성 기준으로 쓰기 나쁘다.
--
-- 기존 'three_quarter' 는 좌측 45도였으므로 'left' 로 그대로 옮긴다.
-- 이미 만든 캐릭터는 우측이 없는 채로 남는다 — 없는 각도는 정면으로 대체된다.

alter table public.character_views
  drop constraint if exists character_views_angle_check;

update public.character_views
  set angle = 'left'
  where angle = 'three_quarter';

alter table public.character_views
  add constraint character_views_angle_check
  check (angle in ('front', 'left', 'right', 'back'));
