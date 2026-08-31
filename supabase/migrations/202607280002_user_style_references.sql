-- 사용자별 스타일 레퍼런스.
--
-- 지금까지 레퍼런스는 Neon 에 전역 공용으로 있었다. 그대로 사용자를 받으면
-- A 셀러가 올린 디자인이 B 셀러의 생성 결과에 씌워진다. 출시 전 기획물이
-- 경쟁사에 새어나가고, 아무나 올린 것이 섞여 "어울리는 레퍼런스를 고른다"는
-- 전제도 무너진다. 공용은 두지 않는다.
--
-- 임베딩 컬럼이 없다. 레퍼런스 선택은 임베딩이 아니라 LLM 이 한다 — 임베딩으로는
-- 못 고른다는 것을 이미 쟀다(위스키를 포함해 모든 질의에서 "산뜻한 파스텔"이
-- 1위였다). 사용자별로 나누면 대부분 열 몇 장이라 좁힐 일도 없다. 수백 장이
-- 되면 그때 넣는다.

create table if not exists public.style_references (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  -- upload: 사용자가 첨부 / generated: 내 생성 결과 / seed: 초기 제공 견본
  source      text not null default 'upload' check (source in ('upload', 'generated', 'seed')),
  -- Storage 경로. 형식은 {user_id}/{reference_id}.{ext}
  path        text not null,
  mime_type   text not null default 'image/png',
  -- Gemini 가 읽어낸 디자인 특성. LLM 이 이걸 보고 고른다.
  description text not null,
  created_at  timestamptz not null default now()
);

create index if not exists style_references_user_created_idx
  on public.style_references (user_id, created_at desc);

alter table public.style_references enable row level security;

drop policy if exists "members manage own style references" on public.style_references;
create policy "members manage own style references"
  on public.style_references
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── Storage ────────────────────────────────────────────────────────
-- 라이브러리와 같은 방식이다. 비공개 버킷 + 경로 첫 칸이 소유자.

insert into storage.buckets (id, name, public)
values ('references', 'references', false)
on conflict (id) do update set public = false;

drop policy if exists "members read own reference files" on storage.objects;
create policy "members read own reference files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'references'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members write own reference files" on storage.objects;
create policy "members write own reference files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'references'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "members delete own reference files" on storage.objects;
create policy "members delete own reference files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'references'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
