-- 카드뉴스 프로젝트, 생성 비용 요청, 카드 결과.

create table public.sns_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 수집함에서 왔으면 그 후보. "제작함"은 이 관계가 있는지로 판정한다.
  candidate_id uuid references public.ingest_candidates(id) on delete set null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','planning','copy_ready','generating','ready','failed')),
  ratio text not null,
  language text not null default 'ko',
  model_id text not null,
  card_count_mode text not null default 'auto' check (card_count_mode in ('auto','fixed')),
  card_count int,
  tone_note text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- fal 호출 한 건. 회원은 읽기만 하고 서버 admin 클라이언트가 쓴다.
-- 프로젝트를 지워도 비용 장부는 user_id 와 함께 남긴다.
create table public.sns_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.sns_projects(id) on delete set null,
  card_index int not null,
  fal_request_id text,
  model_id text not null,
  mode text not null check (mode in ('t2i','i2i')),
  size jsonb not null default '{}'::jsonb,
  requested_images int not null default 1,
  returned_images int not null default 0,
  unit_cost_usd numeric(10,4),
  cost_usd numeric(10,4),
  created_at timestamptz not null default now()
);

create table public.sns_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.sns_projects(id) on delete cascade,
  index int not null,
  -- place_as_is 는 생성하지 않고 원본을 여백으로 맞춰 넣는다.
  kind text not null default 'generated' check (kind in ('generated','place_as_is','ending_image')),
  role text not null check (role in ('cover','body','ending')),
  copy jsonb not null default '{}'::jsonb,
  prompt text,
  asset_path text,
  status text not null default 'pending'
    check (status in ('pending','generating','review_required','done','failed')),
  review jsonb,
  error text,
  unique (project_id, index)
);

create index sns_projects_user_idx on public.sns_projects(user_id, updated_at desc);
create index sns_projects_candidate_idx on public.sns_projects(candidate_id) where candidate_id is not null;
create index sns_cards_project_idx on public.sns_cards(project_id, index);
create index sns_requests_project_idx on public.sns_generation_requests(project_id, created_at desc);

alter table public.sns_projects enable row level security;
alter table public.sns_generation_requests enable row level security;
alter table public.sns_cards enable row level security;

create policy "members manage own sns projects"
  on public.sns_projects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      candidate_id is null
      or exists (
        select 1 from public.ingest_candidates candidate
        where candidate.id = candidate_id
          and (select auth.uid()) = candidate.user_id
      )
    )
  );

-- 비용 요청은 회원이 자기 장부를 읽기만 한다.
create policy "members manage own sns requests"
  on public.sns_generation_requests for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "members manage own sns cards"
  on public.sns_cards for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.sns_projects project
      where project.id = project_id
        and (select auth.uid()) = project.user_id
    )
  );

-- 회원 프로젝트: 기본 테이블 INSERT·UPDATE를 걷고 입력 컬럼만 연다.
grant select, delete on public.sns_projects to authenticated;
revoke insert on public.sns_projects from authenticated;
grant insert (user_id, candidate_id, title, ratio, language, model_id, card_count_mode, card_count, tone_note, data)
  on public.sns_projects to authenticated;
revoke update on public.sns_projects from authenticated;
grant update (title, status, ratio, language, model_id, card_count_mode, card_count, tone_note, data, updated_at)
  on public.sns_projects to authenticated;

-- 비용 행: 서버 admin만 쓰고 회원은 읽기만 한다.
grant select on public.sns_generation_requests to authenticated;
revoke insert, update, delete on public.sns_generation_requests from authenticated;

-- 회원 카드: 생성 결과·검수 필드는 INSERT에서 닫고 허용된 수정 경로로만 연다.
grant select, delete on public.sns_cards to authenticated;
revoke insert on public.sns_cards from authenticated;
grant insert (user_id, project_id, index, kind, role, copy, prompt)
  on public.sns_cards to authenticated;
revoke update on public.sns_cards from authenticated;
grant update (copy, prompt, asset_path, status, review, error)
  on public.sns_cards to authenticated;
