-- 회원이 지운 재료를 보관한다(2026-10-08 사용자 결정, 계획 `2026-10-08-soft-delete-retention.md` 2단계).
--
-- **이 마이그레이션을 앱보다 먼저 적용한다.** 새 앱은 회원이 지울 때 이 칸을 채운다. 칸이 없으면
-- PostgREST 가 PGRST204 로 거절해 지우기가 전부 실패한다. 옛 앱은 이 칸을 안 쓰므로 먼저 적용해도 그대로 돈다.
--
-- 참고 이미지·캐릭터·쉽게 대화를 회원이 지우면 행·파일을 남기고 `deleted_at` 만 채운다. 회원 화면과 만들기
-- 재료에서는 사라지고, 관리자는 「회원이 삭제한 자료」에서 보고 완전 삭제할 수 있다. 6개월이 지나면 자동으로
-- 완전 삭제한다(3단계). 탈퇴는 지금처럼 함께 지운다. 참고 이미지 묶음(reference_sets)은 그림을 가리키는 목록일
-- 뿐이라 지금처럼 지운다 — 그림 자체는 남는다.

alter table public.characters
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.reference_images
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

alter table public.easy_conversations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

-- 회원 목록은 살아 있는 것만 읽는다. 관리자 목록과 6개월 파기는 지운 것만 훑는다.
create index if not exists characters_deleted_idx on public.characters (deleted_at) where deleted_at is not null;
create index if not exists reference_images_deleted_idx on public.reference_images (deleted_at) where deleted_at is not null;
create index if not exists easy_conversations_deleted_idx on public.easy_conversations (deleted_at) where deleted_at is not null;

-- 카드뉴스를 열 때마다(생성 중 상태 확인 포함) 첨부 위치가 회원이 지운 라이브러리 결과물의 그림인지 본다
-- (`lib/sns/retired-attachments.ts`). 이 표에는 (item_id, position) 색인뿐이라 색인 없이 표 전체를 훑게 된다.
create index if not exists library_images_user_path_idx on public.library_images (user_id, path);

-- ── 회원 화면에서 지운 것을 뺀다 ──────────────────────────────────────────────
--
-- 허용 정책(자기 것 + 팀 읽기)은 서로 OR 로 합쳐지므로 한쪽에만 조건을 걸면 다른 쪽으로 새어 나간다 — 모든 허용
-- 정책 위에 덧씌우는 RESTRICTIVE 정책을 둔다(1단계와 같다). 서버(service_role)는 RLS 를 거치지 않으므로 관리자
-- 화면·보관·6개월 파기는 그대로 다 본다. 앱이 서버 권한으로 읽는 길(캐릭터·참고 이미지)은 코드가 따로 거른다.

drop policy if exists "hide deleted characters" on public.characters;
create policy "hide deleted characters" on public.characters
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

drop policy if exists "hide deleted reference images" on public.reference_images;
create policy "hide deleted reference images" on public.reference_images
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

drop policy if exists "hide deleted easy conversations" on public.easy_conversations;
create policy "hide deleted easy conversations" on public.easy_conversations
  as restrictive for all to authenticated
  using (deleted_at is null) with check (deleted_at is null);

-- 딸린 표는 부모가 살아 있을 때만. 정책은 부모 표를 회원 권한으로 읽으므로 위 규칙이 함께 걸린다.
-- **칸 이름은 표 이름을 붙여 쓴다** — 부모 표의 같은 이름 칸을 읽지 않게(1단계 주석).
drop policy if exists "hide views of deleted characters" on public.character_views;
create policy "hide views of deleted characters" on public.character_views
  as restrictive for all to authenticated
  using (exists (select 1 from public.characters c where c.id = character_views.character_id and c.deleted_at is null))
  with check (exists (select 1 from public.characters c where c.id = character_views.character_id and c.deleted_at is null));

drop policy if exists "hide messages of deleted easy conversations" on public.easy_messages;
create policy "hide messages of deleted easy conversations" on public.easy_messages
  as restrictive for all to authenticated
  using (exists (select 1 from public.easy_conversations c where c.id = easy_messages.conversation_id and c.deleted_at is null))
  with check (exists (select 1 from public.easy_conversations c where c.id = easy_messages.conversation_id and c.deleted_at is null));

-- 묶음 항목은 가리키는 그림이 살아 있을 때만. 전에는 그림을 지우면 FK 가 항목을 함께 지웠다 — 이제 그림 줄이
-- 남으므로, 안 막으면 회원의 묶음에 지운 그림이 다시 걸린다.
drop policy if exists "hide set items of deleted reference images" on public.reference_set_items;
create policy "hide set items of deleted reference images" on public.reference_set_items
  as restrictive for all to authenticated
  using (exists (select 1 from public.reference_images r where r.id = reference_set_items.reference_image_id and r.deleted_at is null))
  with check (exists (select 1 from public.reference_images r where r.id = reference_set_items.reference_image_id and r.deleted_at is null));
