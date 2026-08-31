-- 수집 미디어와 수집함.
-- 같은 DB 를 개인 배포(detail-page-studio)와 공유한다. 새 테이블만 추가하고
-- 기존 테이블은 건드리지 않는다.

create table public.ingest_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('youtube_video','youtube_channel','rss','community','naver_news','official_ai')),
  name text not null,
  url text not null,
  interval_hours int not null default 12 check (interval_hours between 1 and 168),
  enabled boolean not null default true,
  -- 워커가 쓰는 칸. 리스로 중복 실행을 막는다.
  last_checked_at timestamptz,
  next_poll_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ingest_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_id uuid references public.ingest_sources(id) on delete set null,
  external_id text not null,
  title text not null,
  url text,
  body text,
  summary text,
  thumbnail_url text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','picked','requested','archived')),
  -- 같은 소스에서 같은 글을 두 번 담지 않는다.
  unique (source_id, external_id)
);

create index ingest_sources_poll_idx on public.ingest_sources(next_poll_at) where enabled;
create index ingest_sources_user_idx on public.ingest_sources(user_id, created_at desc);
create index ingest_candidates_user_idx on public.ingest_candidates(user_id, collected_at desc);

alter table public.ingest_sources enable row level security;
alter table public.ingest_candidates enable row level security;

create policy "members manage own ingest sources"
  on public.ingest_sources for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "members manage own ingest candidates"
  on public.ingest_candidates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에.
grant select, insert, delete on public.ingest_sources to authenticated;
revoke update on public.ingest_sources from authenticated;
grant update (name, url, interval_hours, enabled, updated_at) on public.ingest_sources to authenticated;

grant select, insert on public.ingest_candidates to authenticated;
revoke update on public.ingest_candidates from authenticated;
grant update (status) on public.ingest_candidates to authenticated;
