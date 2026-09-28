-- ════════════════════════════════════════════════════════════════════
--  문의를 남긴다
--  (2026-09-23 사용자 결정, 설계 2026-09-23-cs-ai-bot-design.md §10)
--
--    · 직접 문의를 원할 경우에는 **관리자화면에 문의 내용과 로그를 기록**하게
--      하고, ai.dev@fixupworld.com 으로 메일을 받을 수 있게 하세요.
--
--  ── 왜 둘 다인가 ──────────────────────────────────────────────────
--
--  메일은 **빨리 알기** 위한 것이고 표는 **남기기** 위한 것이다. 메일만 두면
--  지워지거나 묻히고, 표만 두면 아무도 안 본다.
--
--  **메일이 안 가도 문의는 남는다.** 앱이 먼저 표에 넣고 그다음 보낸다.
--  못 보냈으면 `mailed_at` 이 비어 있어 관리자 화면이 그것을 보여 준다.
--
--  ── 왜 대화를 함께 남기나 ─────────────────────────────────────────
--
--  「결제가 안 돼요」 한 줄만 오면 담당자가 다시 물어야 한다. 봇이 이미
--  물어본 것이 있으면 그것이 답의 절반이다.
--
--  **봇이 못 찾은 근거도 남긴다**(`evidence` 가 빈 배열). 지식 구멍이
--  거기서 드러난다 — 같은 물음이 반복되면 설명서에 그 글이 없다는 뜻이다.
--
--  ── 누가 읽나 ─────────────────────────────────────────────────────
--
--  본인은 제 것만, 관리자는 다 본다. **쓰기는 서버 키로만** 한다 — 누가
--  보냈는지는 세션이 정해야 하고 그 판단은 앱에 있다.
--
--  칸을 더하기만 한다. 기존 표는 건드리지 않는다.
--  여러 번 돌려도 안전하다.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.cs_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  -- 사용자가 친 그 말.
  question text not null check (length(question) between 1 and 4000),

  -- 그때까지의 대화. `[{"role":"user","text":"…"}, …]`
  transcript jsonb not null default '[]'::jsonb,

  -- 봇이 찾은 근거. `[{"name":"이용 안내 · 크레딧","href":"/guide/credits"}, …]`
  -- **빈 배열이면 못 찾았다는 뜻이다.** 지식 구멍이 여기서 드러난다.
  evidence jsonb not null default '[]'::jsonb,

  -- 어느 화면에서 물었나. 상세페이지 3단계인지 결제 화면인지.
  page text,

  status text not null default 'new' check (status in ('new', 'reading', 'done')),

  -- 메일을 보낸 때. 비어 있으면 **못 보냈다.**
  mailed_at timestamptz
);

-- 관리자 화면은 안 본 것부터 최근 순으로 본다.
create index if not exists cs_inquiries_status_idx
  on public.cs_inquiries (status, created_at desc);

-- 회원 관리에서 그 회원의 문의를 바로 열 수 있게.
create index if not exists cs_inquiries_user_idx
  on public.cs_inquiries (user_id, created_at desc);

alter table public.cs_inquiries enable row level security;

-- 본인은 제 것만 읽는다.
drop policy if exists cs_inquiries_read_own on public.cs_inquiries;
create policy cs_inquiries_read_own on public.cs_inquiries
  for select using (auth.uid() = user_id);

-- 관리자는 다 읽는다.
drop policy if exists cs_inquiries_read_admin on public.cs_inquiries;
create policy cs_inquiries_read_admin on public.cs_inquiries
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

/*
  **쓰기 정책을 안 만든다.**

  RLS 를 켜고 정책이 없으면 그 동작은 막힌다. 서버의 관리 키는 RLS 를
  지나가므로 앱은 그대로 쓴다 — 브라우저에서 직접 넣는 길만 닫힌다.
  누가 보냈는지는 세션이 정해야 하고, 그 판단은 앱에 있다.
*/

-- ── 확인 ─────────────────────────────────────────────────────────────
--
-- select count(*) from public.cs_inquiries;          → 0
-- select relrowsecurity from pg_class
--   where relname = 'cs_inquiries';                  → t
