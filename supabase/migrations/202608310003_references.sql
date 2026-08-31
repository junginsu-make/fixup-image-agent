-- 카드뉴스와 포스터가 함께 쓰는 참고 이미지와 묶음 세트.
-- 파일은 library 버킷의 {user_id}/references/{id}.{ext} 경로에 둔다.

create table public.reference_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  title text,
  purpose text not null default 'cardnews' check (purpose in ('cardnews','poster','both')),
  width int,
  height int,
  created_at timestamptz not null default now(),
  constraint reference_images_storage_path_check check (
    storage_path ~ ('^' || user_id::text || '/references/' || id::text || '\.[^/]+$')
  )
);

create table public.reference_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  purpose text not null default 'cardnews' check (purpose in ('cardnews','poster','both')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reference_set_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.reference_sets(id) on delete cascade,
  reference_image_id uuid not null references public.reference_images(id) on delete cascade,
  role text not null check (role in ('cover','body','ending')),
  position int not null default 0
);

create index reference_images_user_idx on public.reference_images(user_id, created_at desc);
create index reference_sets_user_idx on public.reference_sets(user_id, updated_at desc);
create index reference_set_items_set_idx on public.reference_set_items(set_id, position);

alter table public.reference_images enable row level security;
alter table public.reference_sets enable row level security;
alter table public.reference_set_items enable row level security;

create policy "members manage own reference images"
  on public.reference_images for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "members manage own reference sets"
  on public.reference_sets for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 항목은 세트를 통해 소유가 정해진다.
create policy "members manage own reference set items"
  on public.reference_set_items for all to authenticated
  using (exists (select 1 from public.reference_sets s
                  where s.id = set_id and (select auth.uid()) = s.user_id)
         and exists (select 1 from public.reference_images i
                      where i.id = reference_image_id and (select auth.uid()) = i.user_id))
  with check (exists (select 1 from public.reference_sets s
                       where s.id = set_id and (select auth.uid()) = s.user_id)
              and exists (select 1 from public.reference_images i
                           where i.id = reference_image_id and (select auth.uid()) = i.user_id));

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에 둔다.
grant select, delete on public.reference_images to authenticated;
revoke insert on public.reference_images from authenticated;
grant insert (id, user_id, storage_path, title, purpose, width, height)
  on public.reference_images to authenticated;
revoke update on public.reference_images from authenticated;
grant update (title, purpose) on public.reference_images to authenticated;

grant select, delete on public.reference_sets to authenticated;
revoke insert on public.reference_sets from authenticated;
grant insert (user_id, name, purpose)
  on public.reference_sets to authenticated;
revoke update on public.reference_sets from authenticated;
grant update (name, purpose, updated_at) on public.reference_sets to authenticated;

grant select, delete on public.reference_set_items to authenticated;
revoke insert on public.reference_set_items from authenticated;
grant insert (set_id, reference_image_id, role, position)
  on public.reference_set_items to authenticated;
revoke update on public.reference_set_items from authenticated;
grant update (role, position) on public.reference_set_items to authenticated;
