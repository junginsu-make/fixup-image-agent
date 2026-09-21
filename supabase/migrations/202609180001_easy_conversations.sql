-- Easy 모드의 대화를 담는다 (설계 `2026-09-17-easy-mode-design.md` §4-1).
--
-- ChatGPT 처럼 왼쪽에 지난 대화가 쌓여야 한다. 앞 판은 브라우저
-- (`sessionStorage`)에만 두기로 했었는데, 그러면 **왼쪽 레일이 늘 비어 있다** —
-- 모양만 ChatGPT 이고 돌아갈 곳이 없다(2026-09-17 사용자 결정).
--
-- **이 마이그레이션을 앱보다 먼저 적용한다.** 순서가 반대면 Easy 가 첫 화면부터
-- 깨진다 — 목록을 읽는 것이 그 화면이 하는 첫 일이다.

create table if not exists public.easy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 첫 프롬프트 앞부분으로 짓는다. LLM 을 한 번 더 부르지 않는다 —
  -- 값이 들고, 제목 때문에 기다리게 된다(설계 §4-1).
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.easy_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.easy_conversations(id) on delete cascade,
  role text not null check (role in ('user','system','image')),
  body text not null default '',
  -- **그림을 여기 안 넣는다.** 결과물은 라이브러리가 갖고 있고 거기에 주인이
  -- 있다. 여기서는 가리키기만 한다 — 두 곳에 두면 하나는 곧 어긋난다.
  --
  -- `library_items` 를 참조하지 않는다. 사용자가 라이브러리에서 그림을 지우면
  -- 대화 줄이 함께 사라지는 것이 아니라 **그림만 없어진 대화**로 남아야 한다.
  work_id uuid,
  created_at timestamptz not null default now()
);

-- 대화 하나를 열 때 그 줄들을 시간순으로 읽는다.
create index if not exists easy_messages_conversation_idx
  on public.easy_messages (conversation_id, created_at);

-- 레일의 목록은 최근 것부터.
create index if not exists easy_conversations_user_idx
  on public.easy_conversations (user_id, updated_at desc);

alter table public.easy_conversations enable row level security;
alter table public.easy_messages enable row level security;

/*
  **본인 것만 본다.**

  이 저장소는 팀 읽기 정책이 있어 목록이 남의 것까지 보이는 경우가 있다.
  2026-09-15 에 포스터 삭제에서 실제로 겪었다 — 목록은 팀원 것까지 보여 주는데
  지우기는 RLS 가 0줄로 막았고, supabase-js 는 오류를 안 줬다. 그래서 남의 그림
  파일만 실제로 지워지는, 되돌릴 수 없는 상태가 됐다.

  대화에는 사용자가 친 말이 그대로 쌓인다 — 제품명·행사명이 들어간다.
  **팀 공유를 하지 않는다.**
*/
create policy "members manage own easy conversations"
  on public.easy_conversations for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/*
  줄은 **자기 대화에 속해야** 한다. id 만 알면 남의 대화에 줄을 붙이는 일이
  없어야 한다 — `poster_images` 가 같은 판단을 한다.
*/
create policy "members manage own easy messages"
  on public.easy_messages for all to authenticated
  using (exists (select 1 from public.easy_conversations c
                  where c.id = conversation_id and c.user_id = (select auth.uid())))
  with check (exists (select 1 from public.easy_conversations c
                       where c.id = conversation_id and c.user_id = (select auth.uid())));
