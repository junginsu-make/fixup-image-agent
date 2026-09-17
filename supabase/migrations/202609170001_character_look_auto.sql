-- 캐릭터도 「레퍼런스 스타일」(auto)을 고를 수 있게 한다.
--
-- 전에는 캐릭터의 결 목록에서 그것만 뺐다. 「캐릭터는 글로만 만드는 도구」라고
-- 봤기 때문인데, 캐릭터는 그림을 받는다 — 붙인 그림의 화풍을 따라가는 것이
-- 뜻이 있다(2026-09-17).
--
-- **이 마이그레이션을 앱보다 먼저 적용한다.** 순서가 반대면 「레퍼런스 스타일」로
-- 만든 캐릭터가 저장 단계에서 전부 떨어지고, Postgres 원문이 화면에 찍힌다.
-- 각도를 만들기 전에 막히는데 정면 후보 값은 이미 차감된 뒤다.
alter table characters
  drop constraint if exists characters_look_check,
  add constraint characters_look_check
    check (look in ('auto','photoreal','anime','3d','illustration'));
