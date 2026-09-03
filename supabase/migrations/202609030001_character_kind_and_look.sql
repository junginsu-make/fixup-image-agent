-- 캐릭터가 사람만이 아니게 된다. 무엇을(kind) 어떤 결로(look) 만들었는지 남긴다.
-- visual_style 은 그대로 둔다 — 상세페이지가 아직 읽는다.
alter table characters
  add column if not exists kind text not null default 'person',
  add column if not exists look text not null default 'photoreal';

alter table characters
  drop constraint if exists characters_kind_check,
  add constraint characters_kind_check
    check (kind in ('person','animal','character','object'));

alter table characters
  drop constraint if exists characters_look_check,
  add constraint characters_look_check
    check (look in ('photoreal','anime','3d','illustration'));

-- 옛 줄은 사람이고, visual_style 이 결을 알려 준다.
update characters
   set look = case when visual_style = 'photoreal' then 'photoreal' else 'illustration' end
 where look = 'photoreal' and visual_style <> 'photoreal';

-- 각도 하나만 다시 만들 때 그 줄을 갈아 끼운다. upsert 가 이 제약을 쓴다.
-- 없으면 다시 만들 때마다 같은 각도가 여러 줄로 쌓인다.
delete from character_views a
 using character_views b
 where a.character_id = b.character_id
   and a.angle = b.angle
   and a.created_at < b.created_at;

create unique index if not exists character_views_character_angle_key
  on character_views (character_id, angle);
