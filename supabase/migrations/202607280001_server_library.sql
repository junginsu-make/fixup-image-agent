-- 사용자별 서버 라이브러리.
--
-- 지금까지 결과물은 브라우저 IndexedDB 에만 있었다. 그래서 다른 기기에서 안 보이고,
-- 한 PC 를 두 사람이 쓰면 서로의 작업물이 보이고, 브라우저 데이터를 지우면 전부
-- 사라졌다. 크레딧을 써서 만든 결과가 브라우저 청소 한 번에 없어지는 구조였다.
--
-- 이미지는 Storage 버킷 'library' 에, 메타데이터만 여기에 둔다. 섹션 이미지 한 장이
-- 2~5MB라 base64 로 행에 넣으면 목록 조회조차 느려진다.

create table if not exists public.library_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,
  tool          text not null check (tool in ('create', 'redesign')),
  aspect_ratio  text,
  image_count   integer not null default 0 check (image_count >= 0),
  cover_path    text,
  created_at    timestamptz not null default now()
);

create index if not exists library_items_user_created_idx
  on public.library_items (user_id, created_at desc);

create table if not exists public.library_images (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.library_items(id) on delete cascade,
  -- 정규화만 보면 중복이지만, RLS 정책이 조인 없이 성립해야 빠르고 실수가 적다.
  user_id    uuid not null references public.profiles(id) on delete cascade,
  position   integer not null check (position >= 0),
  -- Storage 경로. 형식은 {user_id}/{item_id}/{position}.{ext}
  path       text not null,
  mime_type  text not null default 'image/png',
  created_at timestamptz not null default now(),
  unique (item_id, position)
);

create index if not exists library_images_item_idx
  on public.library_images (item_id, position);

alter table public.library_items enable row level security;
alter table public.library_images enable row level security;

-- 남의 작업물은 조회조차 되면 안 된다. 기존 profiles/generation_events 와 같은 패턴.
drop policy if exists "members manage own library items" on public.library_items;
create policy "members manage own library items"
  on public.library_items
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "members manage own library images" on public.library_images;
create policy "members manage own library images"
  on public.library_images
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Storage ────────────────────────────────────────────────────────
-- 비공개 버킷이다. 공개로 두면 URL 만 알면 누구나 본다 — 상세페이지는 출시 전
-- 기획물이라 공개되면 안 된다. 조회는 짧은 수명의 서명 URL 로 한다.

insert into storage.buckets (id, name, public)
values ('library', 'library', false)
on conflict (id) do update set public = false;

-- 경로 첫 칸이 소유자다({user_id}/...). 경로만 보고 판정할 수 있어, 테이블을
-- 조인하다 실수하는 경로 자체가 없다.
drop policy if exists "members read own library files" on storage.objects;
create policy "members read own library files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members write own library files" on storage.objects;
create policy "members write own library files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete own library files" on storage.objects;
create policy "members delete own library files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
