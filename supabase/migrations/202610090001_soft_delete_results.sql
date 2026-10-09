-- 회원이 지운 생성 결과를 보관한다(2026-10-08 사용자 결정, 계획 `2026-10-08-soft-delete-retention.md` 1단계).
--
-- **이 마이그레이션을 앱보다 먼저 적용한다.** 새 앱은 회원이 지울 때 이 칸을 채운다. 칸이 없으면
-- PostgREST 가 PGRST204 로 거절해 지우기가 전부 실패한다. 옛 앱은 이 칸을 안 쓰므로 먼저 적용해도 그대로 돈다.
--
-- 회원이 지우면 행·파일을 남기고 `deleted_at` 만 채운다. 회원 화면에서는 사라지고, 관리자는 「회원이 삭제함」으로
-- 보고 완전 삭제할 수 있다. 6개월이 지나면 자동으로 완전 삭제한다(3단계). 탈퇴는 지금처럼 함께 지운다.
--
-- `pdp_documents` 는 이미 `deleted_at` 이 있다(202610030001). 여기서는 지운 사람만 더한다.

alter table public.sns_projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.poster_projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.library_items
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.pdp_documents
  add column if not exists deleted_by uuid;

-- 회원 목록은 살아 있는 것만 읽는다. 6개월 파기는 지운 것만 훑는다.
create index if not exists sns_projects_deleted_idx on public.sns_projects (deleted_at) where deleted_at is not null;
create index if not exists poster_projects_deleted_idx on public.poster_projects (deleted_at) where deleted_at is not null;
create index if not exists library_items_deleted_idx on public.library_items (deleted_at) where deleted_at is not null;

-- ── 회원 화면에서 지운 것을 뺀다 ──────────────────────────────────────────────
--
-- 웹사이트는 회원 로그인 권한으로 이 표들을 읽는다(카드뉴스·다양하게 목록, 쉽게 대화 안의 그림 등).
-- 그래서 회원에게 보이는 범위는 이 규칙이 정한다. 허용 정책(자기 것 + 팀 읽기)은 서로 OR 로 합쳐지므로
-- 한쪽에만 조건을 걸면 다른 쪽으로 새어 나간다 — 모든 허용 정책 위에 덧씌우는 RESTRICTIVE 정책을 둔다.
-- 서버(service_role)는 RLS 를 거치지 않으므로 관리자 화면·보관·6개월 파기는 그대로 다 본다.

drop policy if exists "hide deleted sns projects" on public.sns_projects;
create policy "hide deleted sns projects" on public.sns_projects
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

drop policy if exists "hide deleted poster projects" on public.poster_projects;
create policy "hide deleted poster projects" on public.poster_projects
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

drop policy if exists "hide deleted library items" on public.library_items;
create policy "hide deleted library items" on public.library_items
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

-- 딸린 표는 부모가 살아 있을 때만. 정책은 부모 표를 회원 권한으로 읽으므로 위 규칙이 함께 걸린다.
-- **칸 이름은 표 이름을 붙여 쓴다.** 부모 표에도 `project_id`(팀 프로젝트) 칸이 있어, 안 붙이면 부모 칸을 읽는다.
drop policy if exists "hide cards of deleted sns projects" on public.sns_cards;
create policy "hide cards of deleted sns projects" on public.sns_cards
  as restrictive for all to authenticated
  using (exists (select 1 from public.sns_projects p where p.id = sns_cards.project_id and p.deleted_at is null))
  with check (exists (select 1 from public.sns_projects p where p.id = sns_cards.project_id and p.deleted_at is null));

drop policy if exists "hide images of deleted poster projects" on public.poster_images;
create policy "hide images of deleted poster projects" on public.poster_images
  as restrictive for all to authenticated
  using (exists (select 1 from public.poster_projects p where p.id = poster_images.project_id and p.deleted_at is null))
  with check (exists (select 1 from public.poster_projects p where p.id = poster_images.project_id and p.deleted_at is null));

-- 요청 줄은 작업을 지워도 남는 비용 기록이라 작업 칸이 비어 있을 수 있다(on delete set null). 비었으면 그대로 보인다.
drop policy if exists "hide requests of deleted poster projects" on public.poster_generation_requests;
create policy "hide requests of deleted poster projects" on public.poster_generation_requests
  as restrictive for all to authenticated
  using (poster_generation_requests.project_id is null or exists (select 1 from public.poster_projects p
    where p.id = poster_generation_requests.project_id and p.deleted_at is null))
  with check (poster_generation_requests.project_id is null or exists (select 1 from public.poster_projects p
    where p.id = poster_generation_requests.project_id and p.deleted_at is null));

drop policy if exists "hide images of deleted library items" on public.library_images;
create policy "hide images of deleted library items" on public.library_images
  as restrictive for all to authenticated
  using (exists (select 1 from public.library_items i where i.id = library_images.item_id and i.deleted_at is null))
  with check (exists (select 1 from public.library_items i where i.id = library_images.item_id and i.deleted_at is null));
