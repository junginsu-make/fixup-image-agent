-- 작업물에 팀·프로젝트 자리를 낸다. **아직 아무도 안 읽는다.**
--
-- 칸을 더하기만 한다. 값은 전부 `null` 이고, RLS 도 지금 것 그대로다.
-- 이 마이그레이션만 돌려도 동작이 1도 안 바뀐다.
--
-- ── 왜 RLS 와 나눠 돌리나 ─────────────────────────────────────────
--
-- 설계에서는 칸 추가와 RLS 전환이 한 단계였다. 둘로 나눈다 — 칸을 더하는 것은
-- 위험이 없고 RLS 를 바꾸는 것은 이 일에서 가장 위험한 자리다. 한 번에 돌리면
-- 무언가 어긋났을 때 **둘 중 어느 쪽 때문인지 알 수 없다.**
--
-- 칸이 먼저 서야 다음 마이그레이션의 판정 함수가 그 칸을 읽을 수 있다.
--
-- ── 부모 표에만 단다 ──────────────────────────────────────────────
--
-- `sns_cards`·`poster_images`·`library_images`·`character_views` 같은 자식
-- 표에는 안 단다. 자식은 부모를 통해 판정한다 — 양쪽에 달면 둘이 어긋나는
-- 날이 오고, 그때 어느 쪽이 맞는지 정할 근거가 없다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07)

-- ── 팀 ────────────────────────────────────────────────────────────
--
-- `on delete set null` 인 이유. 팀을 지워도 **작업물은 안 지운다.** `team_id`
-- 만 비고, 그 순간부터 만든 사람의 개인 작업으로 떨어진다. `cascade` 로 두면
-- 팀 삭제 한 번에 회원 수십 명의 결과물이 사라진다.
alter table public.library_items
  add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.sns_projects
  add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.poster_projects
  add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.reference_images
  add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.reference_sets
  add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.characters
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- 정산은 팀별로 본다. 크레딧을 팀 몫으로 옮기는 것은 마지막 단계지만, 칸은
-- 지금 내 둔다 — 그때 가서 달면 그 사이에 쌓인 기록에 팀이 없어 셀 수 없다.
alter table public.generation_events
  add column if not exists team_id uuid references public.teams(id) on delete set null;

-- ── 프로젝트 ──────────────────────────────────────────────────────
--
-- 작업물은 프로젝트 **0개 또는 1개**에 속한다. 태그가 아니라 분류다.
-- 프로젝트가 있어야 팀도 있으므로 `team_id` 와 함께 다닌다.
alter table public.library_items
  add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.sns_projects
  add column if not exists project_id uuid references public.projects(id) on delete set null;
alter table public.poster_projects
  add column if not exists project_id uuid references public.projects(id) on delete set null;

-- ── 색인 ──────────────────────────────────────────────────────────
--
-- 목록은 늘 「이 팀 것을 최근 순으로」다. 지금은 값이 전부 null 이라 이 색인이
-- 하는 일이 없지만, 팀이 붙는 날 없으면 목록이 표 전체를 훑는다.
create index if not exists sns_projects_team_idx
  on public.sns_projects (team_id, updated_at desc);
create index if not exists poster_projects_team_idx
  on public.poster_projects (team_id, updated_at desc);
create index if not exists library_items_team_idx
  on public.library_items (team_id, created_at desc);
create index if not exists reference_images_team_idx
  on public.reference_images (team_id, created_at desc);

-- 사이드바에서 프로젝트를 고르면 목록이 걸러진다.
create index if not exists sns_projects_project_idx
  on public.sns_projects (project_id, updated_at desc);
create index if not exists poster_projects_project_idx
  on public.poster_projects (project_id, updated_at desc);
create index if not exists library_items_project_idx
  on public.library_items (project_id, created_at desc);

-- 팀 사용량 집계. 「이 팀이 이번 달에 얼마나 썼나」를 묻는 방향이다.
create index if not exists generation_events_team_period_idx
  on public.generation_events (team_id, period_start);

-- ── RLS 는 손대지 않는다 ──────────────────────────────────────────
--
-- 다음 마이그레이션에서 바꾼다. 지금 정책은 `auth.uid() = user_id` 그대로이고,
-- 새 칸은 어떤 정책도 읽지 않는다 — 그래서 이 마이그레이션은 되돌릴 일이
-- 생겨도 칸만 지우면 그만이다.
--
-- 다만 되돌릴 때 **칸을 지우기 전에 배정된 값이 있는지 본다.** 값이 들어 있는
-- 상태에서 지우면 누가 어느 팀이었는지가 사라진다.
