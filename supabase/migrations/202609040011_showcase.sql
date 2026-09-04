-- 첫 화면 갤러리에 걸 결과물. 관리자가 켠 것만 올라간다.
--
-- 자동으로 다 올리지 않는 이유는 하나다. 회원이 만드는 것은 대부분 출시 전
-- 상업용 기획물이라, 만들자마자 공개 인터넷에 걸리면 사고다.
--
-- ── 왜 library_items 의 칸이 아니라 별도 표인가 ────────────────────────
--
-- 1. 작업물이 한 표에 있지 않다. 라이브러리의 「작업물」은 sns_projects 와
--    poster_projects 를 읽고, library_items 는 리디자인 결과와 직접 올린
--    그림이 들어가는 또 다른 표다. library_items 에 칸을 붙이면 지금 첫
--    화면에 걸린 카드뉴스·포스터는 영영 켤 수 없다.
-- 2. 공개용으로만 필요한 값이 있다. 차례, 대체 텍스트, 종류 이름표는
--    비공개 작업 행에 얹을 값이 아니다.
-- 3. **그림을 복사해 둔다.** 원본 작업을 회원이 지우면 첫 화면이 깨진다.
--    켜는 순간 showcase/ 아래로 한 벌 떠 두면, 원본이 사라져도 첫 화면은
--    그대로 선다. 각 도구의 삭제 코드를 건드릴 필요도 없다.

create table if not exists public.showcase_items (
  id uuid primary key default gen_random_uuid(),

  -- 어디서 온 것인가. 관리자가 되짚어 볼 때만 쓴다. 원본이 사라져도 이 행은
  -- 남아야 하므로 외래 키로 묶지 않는다.
  source_kind text not null check (source_kind in ('library', 'sns', 'poster')),
  source_id   uuid not null,
  -- 여러 장짜리 작업에서 몇 번째 장인가. 같은 그림을 두 번 걸 수 없게 하는 열쇠다.
  source_index int not null default 0,
  -- 만든 사람. 공개 응답에는 절대 싣지 않는다 — 관리자 화면에서만 쓴다.
  owner_id    uuid references public.profiles(id) on delete set null,

  -- library 버킷 안의 복사본. showcase/ 로 시작한다.
  -- Storage 정책은 첫 칸을 소유자로 보므로, 이 경로는 어떤 회원도 직접
  -- 열 수 없다. 오직 서버가 /api/showcase/{id}/file 로만 흘려 준다.
  storage_path text not null,
  mime_type    text not null default 'image/png',
  width        int,
  height       int,

  -- 화면에 쓸 말. 없으면 첫 화면이 알아서 원래 문구를 쓴다.
  caption    text,
  kind_label text,
  position   int not null default 0,

  -- 껐다 켜는 것과 지우는 것을 나눈다. 껐다가 다시 켜려고 설명을 다시
  -- 쓰게 하면 안 된다.
  visible    boolean not null default true,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 같은 그림을 두 번 걸 수 없다. 복사본 경로는 id 로 만드므로
  -- 항상 달라진다 — 원본을 가리키는 세 값으로 묶어야 중복이 잡힌다.
  unique (source_kind, source_id, source_index)
);

create index if not exists showcase_items_visible_idx
  on public.showcase_items (visible, position, created_at desc);

alter table public.showcase_items enable row level security;

-- **정책을 하나도 만들지 않는다.**
--
-- 이 표는 서버가 service role 로만 읽고 쓴다. 공개 목록은 우리 라우트가
-- 껍데기를 벗겨 내보내므로, PostgREST 로 이 표를 직접 긁을 길은 없어야 한다.
-- 그러지 않으면 owner_id 와 storage_path 가 그대로 새 나간다.
--
-- Supabase 는 public 스키마의 새 표에 anon/authenticated 기본 권한을 준다.
-- 회수를 명시하지 않으면 RLS 만으로는 막았다고 볼 수 없다.
revoke all on public.showcase_items from anon;
revoke all on public.showcase_items from authenticated;
