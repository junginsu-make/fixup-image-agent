-- 레이아웃 고정 카드뉴스 — 다시 쓰려고 저장한 뼈대.
--
-- **기본 템플릿 목록은 여기 넣지 않는다.** 코드(`packages/layout-core/src/template.ts`)에
-- 있고, 코드에 있는 것을 DB 에도 두면 둘이 어긋나는 날이 온다. 이 표에는
-- 사람이 「이 뼈대 저장하기」를 누른 것만 들어간다. 안 눌러도 그 카드에는
-- 그대로 쓰인다 — 카드별 선택은 새 표 없이 작업 JSON 에 얹는다.
--
-- 소유자는 `public.profiles` 를 가리킨다. 설계 문서는 `auth.users` 라고 적었지만
-- 이 저장소의 다른 표가 모두 profiles 를 쓴다. 둘을 섞으면 회원 상태(승인·정지)를
-- 보는 자리가 갈린다.

create table public.card_layout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  role text not null check (role in ('cover','body','ending')),
  -- 칸 배열을 통째로 담는다. 칸 종류가 늘어도 마이그레이션이 필요 없다.
  slots jsonb not null,
  created_at timestamptz not null default now()
);

create index card_layout_templates_user_idx
  on public.card_layout_templates(user_id, created_at desc);

alter table public.card_layout_templates enable row level security;

create policy "members manage own layout templates"
  on public.card_layout_templates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 컬럼 권한은 회수 먼저, 허용 목록 나중에. 테이블 GRANT 뒤의 컬럼 REVOKE 는 무시된다.
grant select, delete on public.card_layout_templates to authenticated;
revoke insert, update on public.card_layout_templates from authenticated;
grant insert (user_id, name, role, slots) on public.card_layout_templates to authenticated;
grant update (name, role, slots) on public.card_layout_templates to authenticated;

-- 세트 — 표지 1장 · 속지 N장 · 엔딩 1장을 한 번에 정해 둔 것.
--
-- 뼈대를 참조(id)로 두지 않고 **칸 배열을 통째로 복사해 담는다.** 참조만 두면
-- 나중에 그 뼈대를 고쳤을 때 지난 세트가 소리 없이 달라진다.
--
-- 장수는 표에서 막지 않고 4~8 로 못 박는다. 기존 카드뉴스(`card-count.ts`)가
-- 세는 범위와 같아야 한다.

create table public.card_layout_decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  ratio      text not null,
  total      int  not null check (total between 4 and 8),
  -- { cover: [...], body: [...], ending: [...] }
  frames     jsonb not null,
  created_at timestamptz not null default now()
);

create index card_layout_decks_user_idx
  on public.card_layout_decks(user_id, created_at desc);

alter table public.card_layout_decks enable row level security;

create policy "members manage own layout decks"
  on public.card_layout_decks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, delete on public.card_layout_decks to authenticated;
revoke insert, update on public.card_layout_decks from authenticated;
grant insert (user_id, name, ratio, total, frames) on public.card_layout_decks to authenticated;
grant update (name, ratio, total, frames) on public.card_layout_decks to authenticated;
