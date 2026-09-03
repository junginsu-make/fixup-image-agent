-- 각도가 넷에서 여섯으로 늘었다. 90도 측면이 생기면서 이름이 겹친다 —
-- 지금까지 left·right 는 45도를 뜻했다. 그 이름을 90도에 재활용하지 않고
-- 옛 줄의 이름을 바꾼다. 뜻은 그대로 유지된다.
--
-- 제약을 먼저 푼다. 안 그러면 옛 제약이 새 이름을 막는다.
alter table character_views drop constraint if exists character_views_angle_check;

update character_views set angle = 'left_45'  where angle = 'left';
update character_views set angle = 'right_45' where angle = 'right';
-- 6각도 시절 파일 이름. 그때 three_quarter 는 좌측 45도였다.
update character_views set angle = 'left_45'  where angle = 'three_quarter';

alter table character_views
  add constraint character_views_angle_check
    check (angle in ('front','left_45','right_45','left_90','right_90','back'));
