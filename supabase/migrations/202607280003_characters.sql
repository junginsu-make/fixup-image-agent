-- 상세페이지용 캐릭터.
--
-- 지금은 상세페이지에 사람이 나오면 섹션마다 다른 사람이다. 따로 생성되니
-- 1번 섹션의 인물과 4번 섹션의 인물이 남남이고, 사용자가 고를 수도 없다.
-- 인물을 먼저 만들어 고정해두면 그 사람이 페이지 내내 나온다.
--
-- 저장 방식은 스타일 레퍼런스와 같다. 사용자별, 비공개 버킷, 경로 첫 칸이 소유자.
-- 공용 캐릭터는 두지 않는다 — 남이 만든 얼굴이 내 페이지에 나오면 안 된다.

create table if not exists public.characters (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null,
  -- 사용자가 적은 인물 묘사. 그대로 보존한다.
  source_prompt   text not null,
  -- 다각도 생성과 섹션 생성에 계속 쓰이는 정체성 서술.
  identity_prompt text not null,
  visual_style    text not null default 'photoreal'
                  check (visual_style in ('photoreal', 'illustration')),
  created_at      timestamptz not null default now()
);

create index if not exists characters_user_created_idx
  on public.characters (user_id, created_at desc);

create table if not exists public.character_views (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  -- 정규화로만 보면 중복이지만, RLS 정책이 조인 없이 성립해야 빠르고 실수가 적다.
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- 측면 90도는 상세페이지에서 거의 안 쓴다. 셋만 둔다.
  angle        text not null check (angle in ('front', 'three_quarter', 'back')),
  -- Storage 경로. 형식은 {user_id}/{character_id}/{angle}.{ext}
  path         text not null,
  mime_type    text not null default 'image/png',
  created_at   timestamptz not null default now(),
  unique (character_id, angle)
);

create index if not exists character_views_character_idx
  on public.character_views (character_id);

alter table public.characters enable row level security;
alter table public.character_views enable row level security;

drop policy if exists "members manage own characters" on public.characters;
create policy "members manage own characters"
  on public.characters
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "members manage own character views" on public.character_views;
create policy "members manage own character views"
  on public.character_views
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Storage ────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('characters', 'characters', false)
on conflict (id) do update set public = false;

drop policy if exists "members read own character files" on storage.objects;
create policy "members read own character files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members write own character files" on storage.objects;
create policy "members write own character files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete own character files" on storage.objects;
create policy "members delete own character files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'characters'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
