-- 새로 만드는 것에도 팀을 붙인다.
--
-- 5a 에서 팀에 넣을 때 **이미 만들어 둔 것**에는 도장을 찍었다. 그런데 그
-- 뒤로 새로 만드는 것에는 아무도 팀을 안 적는다. 그대로 두면 이렇게 된다.
--
--   배정 전에 만든 것   팀장이 본다
--   배정 후에 만든 것   팀장이 못 본다
--
-- 거꾸로다. 어제 것은 보이는데 오늘 만든 건 안 보이면 그냥 고장으로 보인다.
--
-- ── 왜 코드가 아니라 트리거인가 ───────────────────────────────────
--
-- 넣는 자리가 일곱 파일에 흩어져 있다.
--
--   lib/server-library.ts                        library_items
--   lib/characters.ts                            characters
--   lib/reference-images.ts                      reference_images
--   lib/poster/supabase-store.ts                 poster_projects
--   lib/sns-flow-store.ts                        sns_projects
--   app/api/sns/projects/project-store.ts        sns_projects
--   app/api/reference-sets/reference-set-store.ts  reference_sets
--
-- 일곱 곳에 같은 두 줄을 복사해 넣으면, **여덟 번째 자리가 생기는 날 그곳만
-- 빠진다.** 그리고 빠진 것은 티가 안 난다 — 만들어지긴 하고 팀장 화면에서만
-- 조용히 사라진다. 그 종류의 버그는 몇 달 뒤에 발견된다.
--
-- 넣는 클라이언트도 제각각이다. 캐릭터와 포스터 이미지는 **서비스 롤**로
-- 넣어서 `auth.uid()` 가 비어 있다. 그래서 판정은 세션이 아니라 **행의
-- `user_id`** 로 해야 한다 — 트리거는 어느 쪽으로 넣든 같은 답을 낸다.
--
-- 저 파일들 중 여럿을 지금 다른 작업이 고치고 있기도 하다. 표에 거는 것이
-- 코드와 겹치지 않는다.
--
-- ── 덮어쓰지 않는다 ───────────────────────────────────────────────
--
-- `team_id` 를 명시해서 넣으면 그대로 둔다. 프로젝트를 옮기거나 나중에 팀
-- 간 이동을 만들 때, 트리거가 매번 「이 사람의 지금 팀」으로 되돌리면 그
-- 기능이 아예 성립하지 않는다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07) 5단계

-- ── 도장 ──────────────────────────────────────────────────────────
--
-- `security definer` 로 만든다. `team_members` 는 회원에게 select 를 안
-- 열었으므로(표를 만들 때 권한을 회수했다), 소유자 권한으로 돌아야 그 표를
-- 읽는다. `search_path` 를 못 박는 것은 그 종류 함수의 기본이다.
create or replace function public.stamp_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 넣는 쪽이 정했으면 그대로 둔다.
  if new.team_id is not null then
    return new;
  end if;

  -- 세션이 아니라 행의 주인으로 찾는다. 서비스 롤로 넣는 자리가 있어
  -- `auth.uid()` 는 비어 있을 수 있다.
  select tm.team_id into new.team_id
    from public.team_members tm
   where tm.user_id = new.user_id;

  -- 못 찾으면 null 그대로다. 소속 없는 사람의 작업물은 개인 것으로 남는다.
  return new;
end;
$$;

-- ── 여섯 표에 건다 ────────────────────────────────────────────────
--
-- 자식 표(`sns_cards`·`poster_images`·`library_images`·`character_views`)에는
-- 안 건다. 자식은 부모를 통해 판정한다 — 4단계에서 정한 그대로다.
--
-- `generation_events` 에도 아직 안 건다. 정산은 6단계이고, 그때 함수
-- (`reserve_generation`)가 직접 적는다. 여기서 먼저 붙이면 크레딧 계산이
-- 6단계 전에 팀 단위로 바뀐다 — 돈이 오가는 자리라 순서를 지킨다.

create trigger stamp_team_library_items
  before insert on public.library_items
  for each row execute function public.stamp_team();

create trigger stamp_team_sns_projects
  before insert on public.sns_projects
  for each row execute function public.stamp_team();

create trigger stamp_team_poster_projects
  before insert on public.poster_projects
  for each row execute function public.stamp_team();

create trigger stamp_team_reference_images
  before insert on public.reference_images
  for each row execute function public.stamp_team();

create trigger stamp_team_reference_sets
  before insert on public.reference_sets
  for each row execute function public.stamp_team();

create trigger stamp_team_characters
  before insert on public.characters
  for each row execute function public.stamp_team();

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- 트리거만 지우면 그 순간부터 새 것에 팀이 안 붙는다. 이미 붙은 것은
-- 그대로 남는다 — 지우지 않는다.
--
-- drop trigger if exists stamp_team_library_items    on public.library_items;
-- drop trigger if exists stamp_team_sns_projects     on public.sns_projects;
-- drop trigger if exists stamp_team_poster_projects  on public.poster_projects;
-- drop trigger if exists stamp_team_reference_images on public.reference_images;
-- drop trigger if exists stamp_team_reference_sets   on public.reference_sets;
-- drop trigger if exists stamp_team_characters       on public.characters;
-- drop function if exists public.stamp_team();
