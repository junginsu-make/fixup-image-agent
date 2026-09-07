-- 팀 워크스페이스 — 표만 만든다.
--
-- **읽거나 쓰는 코드가 아직 없다.** 화면도 없다. 이 마이그레이션만 돌려도
-- 지금 동작은 1도 안 바뀐다. 그래서 되돌릴 때도 표 셋을 지우면 그만이다.
--
-- 기존 표에 칸을 더하는 것(`team_id`)과 RLS 를 팀 기준으로 바꾸는 것은
-- **다음 단계**다. 그쪽이 이 프로젝트에서 가장 위험한 자리라, 표만 먼저
-- 세워 두고 그 위에서 확인한 뒤에 손댄다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07)

-- ── 팀 ────────────────────────────────────────────────────────────
--
-- `deleted_at` 을 두는 이유. 팀을 지우면 그 안의 작업물이 통째로 안 보이게
-- 되는데, 되돌릴 길이 없으면 그건 사고다. 지운 팀은 목록에서 빼되 행은 남긴다.
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),

  -- 팀이 한 달에 쓸 수 있는 총량. **아직 아무도 안 읽는다.**
  -- 크레딧을 팀 몫으로 옮기는 것은 마지막 단계다 — 돈이 오가는 길이라
  -- 나머지가 다 선 뒤에 손댄다. 0 은 「아직 안 정했다」는 뜻이다.
  monthly_quota integer not null default 0
                check (monthly_quota >= 0 and monthly_quota <= 1000000),

  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- 살아 있는 팀만 목록에 낸다.
create index teams_alive_idx on public.teams (created_at desc) where deleted_at is null;

-- ── 팀원 ──────────────────────────────────────────────────────────
--
-- **한 사람은 한 팀에만 속한다.** `user_id` 를 기본 키로 둔 것이 그 판단이다.
--
-- 여러 팀을 허용하면 「지금 어느 팀 이름으로 만드나」를 모든 만들기 화면에서
-- 물어야 하고, 크레딧이 어느 팀에서 빠지는지도 갈린다. 필요해지면 그때 키를
-- 넓힌다 — 넓히는 것은 쉽고 좁히는 것은 어렵다.
--
-- 여기 없는 사람은 **미배정**이다. 억지로 1인 팀을 만들어 넣지 않는다.
-- 그러면 아무도 안 쓰는 팀이 사람 수만큼 생기고, 「팀이 47개인데 진짜 팀은
-- 3개」가 된다. 비어 있는 것이 문제라면 비어 있음을 드러내는 편이 낫다 —
-- 화면이 미배정 인원을 맨 위에 올리고 숫자로 알린다.
create table public.team_members (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  team_id   uuid not null references public.teams(id) on delete cascade,
  role      text not null default 'member' check (role in ('leader', 'member')),
  joined_at timestamptz not null default now()
);

-- 「이 팀에 누가 있나」를 묻는 자리가 팀 관리 화면이다. 기본 키는 user_id 라
-- 이 방향은 따로 색인이 있어야 한다.
create index team_members_team_idx on public.team_members (team_id);

-- ── 프로젝트 ──────────────────────────────────────────────────────
--
-- 팀 아래 **한 겹**이다. 중첩 폴더를 두지 않는다 — 지금 필요 없고, 필요해지는
-- 날이 오면 그때가 훨씬 싸게 만들 수 있는 시점이다.
--
-- 작업물은 프로젝트 0개 또는 1개에 속한다(다음 단계에서 `project_id` 를 단다).
-- 태그가 아니라 분류다.
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),

  -- 사이드바에 거는 차례. 회원이 손으로 정한다.
  position    integer not null default 0,

  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  -- 지우지 않고 접는다. 프로젝트를 지우면 거기 묶인 작업물의 분류가 사라지는데,
  -- 그건 되돌릴 수 없다. 접힌 프로젝트는 목록에서 빠지고 작업물은 그대로 있다.
  archived_at timestamptz,

  -- 같은 팀 안에서 이름이 겹치면 어느 쪽에 넣었는지 알 수 없다.
  unique (team_id, name)
);

create index projects_team_idx on public.projects (team_id, position, created_at);

-- ── 접근 ──────────────────────────────────────────────────────────
--
-- **정책을 하나도 만들지 않는다.** `showcase_items` 와 같은 방식이다.
--
-- 이 셋은 서버가 service role 로만 읽고 쓴다. 팀 편성은 관리자와 팀장이
-- 다루는 것이라 회원 브라우저가 PostgREST 로 직접 긁을 길이 없어야 한다 —
-- 열어 두면 남의 팀 구성과 이름이 그대로 새 나간다.
--
-- 다음 단계에서 RLS 를 팀 기준으로 바꿀 때, 판정 함수는 `security definer` 로
-- 만들어 이 표를 읽는다. 그래서 회원에게 select 를 열지 않아도 된다.
--
-- Supabase 는 public 스키마의 새 표에 anon/authenticated 기본 권한을 준다.
-- 회수를 명시하지 않으면 RLS 만으로는 막았다고 볼 수 없다.
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.projects enable row level security;

revoke all on public.teams from anon;
revoke all on public.teams from authenticated;
revoke all on public.team_members from anon;
revoke all on public.team_members from authenticated;
revoke all on public.projects from anon;
revoke all on public.projects from authenticated;
