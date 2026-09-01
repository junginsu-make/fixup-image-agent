-- 포스터 스튜디오. 소유자는 사람 한 명이다. 팀 개념이 없다.
--
-- 레퍼런스는 따로 두지 않는다. 202608310003 의 reference_images 가 이미
-- purpose('cardnews'|'poster'|'both') 를 갖고 있고 라이브러리에서 올린다.
-- 테이블을 또 만들면 올리는 곳이 둘이 되어 사용자가 어디에 뒀는지 못 찾는다.

create table public.poster_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','planning','ready','generating','done','failed')),
  ratio text not null,
  model_id text not null,
  -- 슬롯·레퍼런스 스냅샷을 통째로 담는다. 필드를 늘려도 마이그레이션이 필요 없다.
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- fal 호출 한 건. 과금이 이미지가 아니라 요청에 붙으므로 별도 행으로 둔다.
-- 프로젝트를 지워도 남는다 — 회원이 프로젝트 삭제로 비용 기록을 지울 수 없어야 한다.
create table public.poster_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.poster_projects(id) on delete set null,
  fal_request_id text,
  parent_image_id uuid,
  edit_instruction text,
  model_id text not null,
  ratio_id text not null,
  mode text not null check (mode in ('t2i','i2i')),
  size jsonb not null default '{}'::jsonb,
  requested_images int not null check (requested_images between 1 and 3),
  returned_images int not null default 0,
  unit_cost_usd numeric(10,4),
  cost_usd numeric(10,4),
  cost_approximate boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.poster_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.poster_projects(id) on delete cascade,
  generation_request_id uuid not null references public.poster_generation_requests(id) on delete cascade,
  variant_index int not null,
  selected boolean not null default false,
  asset_path text not null,
  width int, height int,
  review jsonb,
  created_at timestamptz not null default now(),
  -- 같은 요청이 같은 번호를 두 번 돌려줄 수 없다.
  unique (generation_request_id, variant_index)
);

alter table public.poster_generation_requests
  add constraint poster_generation_requests_parent_fk
  foreign key (parent_image_id) references public.poster_images(id) on delete set null;

create index poster_projects_user_idx on public.poster_projects(user_id, updated_at desc);
create index poster_requests_project_idx on public.poster_generation_requests(project_id, created_at desc);
create index poster_images_request_idx on public.poster_images(generation_request_id, variant_index);
-- 프로젝트마다 고른 변형은 하나뿐이다.
--
-- **고르는 코드는 반드시 먼저 풀고 나서 걸어야 한다.** 이 인덱스는 지연 검사가
-- 안 되므로 한 문장에서 새로 걸고 기존 것을 푸는 식이면 순서에 따라 실패한다.
--   1) update ... set selected = false where project_id = $1 and selected
--   2) update ... set selected = true  where id = $2
create unique index poster_images_one_selected on public.poster_images(project_id) where selected;

alter table public.poster_projects enable row level security;
alter table public.poster_generation_requests enable row level security;
alter table public.poster_images enable row level security;

create policy "members manage own poster projects"
  on public.poster_projects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 비용 행은 읽기만. 쓰기는 서버가 admin 으로 한다.
create policy "members read own poster requests"
  on public.poster_generation_requests for select to authenticated
  using ((select auth.uid()) = user_id);

-- 이미지는 자기 것이면서 자기 프로젝트에 속해야 한다.
-- id 만 알면 남의 프로젝트에 붙는 일이 없어야 한다.
create policy "members manage own poster images"
  on public.poster_images for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
    and exists (select 1 from public.poster_projects p
                 where p.id = project_id and p.user_id = (select auth.uid())));

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에. 테이블 GRANT 뒤의 컬럼 REVOKE 는 무시된다.
-- id 를 INSERT 에 열어 둔다 — 파일을 올릴 때 이미 id 를 알아야 경로를 만들 수 있다.

grant select, delete on public.poster_projects to authenticated;
revoke insert on public.poster_projects from authenticated;
grant insert (user_id, title, ratio, model_id, data) on public.poster_projects to authenticated;
revoke update on public.poster_projects from authenticated;
grant update (title, status, ratio, model_id, data, updated_at) on public.poster_projects to authenticated;

-- 회원이 cost_usd 를 고칠 수 있으면 비용 장부를 믿을 수 없다.
grant select on public.poster_generation_requests to authenticated;
revoke insert, update, delete on public.poster_generation_requests from authenticated;

-- 이미지 행도 서버가 쓴다. 회원이 바꾸는 것은 어느 변형을 골랐는지 하나뿐이다.
grant select on public.poster_images to authenticated;
revoke insert, update, delete on public.poster_images from authenticated;
grant update (selected) on public.poster_images to authenticated;
