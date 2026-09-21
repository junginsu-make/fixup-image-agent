-- ════════════════════════════════════════════════════════════════════
--  상세페이지 생성 작업을 서버에 남긴다 — 화면을 닫아도 되찾기 위해
--
--  **지금은 브라우저가 결과를 쥐고 있다.** 생성 중에 탭을 닫거나 새로고침하면
--  이미 값을 치른 그림이 사라진다. 사용자는 다시 눌러 두 번 낸다.
--  (2026-09-17 조사 K-04 / 설계 §8)
--
--  ── 이 파일이 만드는 것 ──────────────────────────────────────────
--    1. `pdp_generation_jobs`  — 작업 한 건. 세 축의 상태와 lease
--    2. `pdp_generation_items` — 섹션 한 장의 결과. 그림이 아니라 **경로**
--    3. `renew_pdp_job_lease()`        — 살아 있는 워커만 예약을 늘린다
--    4. `settle_expired_pdp_job()`     — 만료된 예약의 늦은 성공을 한 번만 처리
--
--  ── 기존 것을 건드리지 않는다 ────────────────────────────────────
--
--  새 표와 새 함수만 더한다. `generation_events` 의 제약도, `reserve_generation`
--  의 본문도 손대지 않는다. **그래서 이 SQL 을 먼저 적용해도 옛 코드가 그대로
--  돈다** — 이 값들을 아무도 안 읽기 때문이다.
--
--  순서: 이 SQL 먼저 → 그다음 코드 배포. (반대로 해도 안전하지만, 코드가 먼저
--  가면 `PDP_JOBS_ENABLED=1` 을 켰을 때 표가 없어 500 이 난다.)
--
--  되돌리기: 아래 두 표와 두 함수를 drop 한다. 기존 표에 흔적이 없다.
--
--  여러 번 돌려도 안전하다.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. 작업 ──────────────────────────────────────────────────────────
--
-- `user_id` 와 `team_id` 를 모두 둔다. 팀 칸이 있어야 `same_team()` 으로
-- 판정할 수 있고, 팀을 지워도 작업물은 남아야 한다(202609070002 의 판단).

create table if not exists public.pdp_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,

  -- 무엇을 만드는가
  document_id text not null,
  revision integer not null check (revision >= 0),
  operation text not null,
  section_ids text[] not null default '{}',

  -- **같은 눌림은 한 번만.** 사용자마다 따로 센다 — 남과 같은 값을 써도 남남이다.
  idempotency_key text not null,
  -- 열쇠가 같아도 내용이 다르면 다른 작업이다. 옛 결과를 새 요청의 답으로
  -- 주면 사용자는 고친 대로 만들어진 줄 안다.
  fingerprint text not null,

  -- 크레딧 예약. **서버가 정한다** — 클라이언트가 제출하지 않는다(설계 §8.1).
  reservation_request_id uuid not null,

  -- 세 축은 서로 독립이다(설계 §8.2). 하나로 합치면 한쪽이 다른 쪽을 덮는다.
  generation text not null default 'validated'
    check (generation in ('validated','reserved','submitting','submitted','generating',
                          'result_available','persisted','completed','review_required',
                          'partial','failed')),
  settlement text not null default 'not_started'
    check (settlement in ('not_started','pending','settled','retry_required')),
  persistence text not null default 'pending'
    check (persistence in ('pending','stored','retry_required')),
  -- `uncertain` 은 「안 갔다」가 아니라 「모른다」다. 둘을 같이 다루면 같은
  -- 유료 호출을 두 번 보낸다.
  submission text not null default 'known'
    check (submission in ('known','uncertain')),

  -- 지금 누가 돌리는가. 잡은 워커가 죽으면 시간이 지나 풀린다.
  lease_owner text,
  lease_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, idempotency_key)
);

-- 워커가 「돌릴 것」을 찾는 질의에 붙는다. 끝난 작업은 빼고 본다.
create index if not exists pdp_jobs_claimable_idx
  on public.pdp_generation_jobs(lease_until)
  where generation not in ('completed','review_required','partial','failed');

create index if not exists pdp_jobs_user_idx
  on public.pdp_generation_jobs(user_id, created_at desc);

-- ── 2. 섹션 한 장 ────────────────────────────────────────────────────
--
-- **그림을 여기 담지 않는다.** base64 를 넣으면 행 하나를 읽을 때마다 수 MB 가
-- 오고 DB 가 붓는다. 스토리지에 두고 경로만 적는다(설계 §8.1).

create table if not exists public.pdp_generation_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.pdp_generation_jobs(id) on delete cascade,

  section_id text not null,
  -- 몇 번째 시도인가. QA 재시도가 붙으면 늘어난다.
  attempt integer not null default 1 check (attempt >= 1),

  -- 공급자 쪽 식별자. **제출했는데 응답을 못 받았을 때** 이것으로 찾는다.
  provider_request_id text,
  model text,
  width integer,
  height integer,

  -- `{user_id}/pdp/...`. 첫 칸이 소유자다 — 경로만 보고 판정할 수 있다.
  output_path text,

  qa jsonb,
  error_code text,
  -- 우리가 실제로 낸 돈. 사용자 차감(크레딧)과는 다른 값이다.
  cost_usd numeric(10,4),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 같은 (섹션, 시도)는 한 줄이다. 두 줄이 되면 같은 그림을 두 번 센다.
  unique (job_id, section_id, attempt)
);

create index if not exists pdp_items_job_idx
  on public.pdp_generation_items(job_id);

-- ── 3. 권한 ──────────────────────────────────────────────────────────
--
-- **읽기만 연다.** 쓰기는 전부 서버(service role)를 거친다 — 예약·상태·원가는
-- 회원이 직접 고칠 수 있으면 안 된다(설계 §8.1).

alter table public.pdp_generation_jobs enable row level security;
alter table public.pdp_generation_items enable row level security;

revoke all on public.pdp_generation_jobs from anon;
revoke all on public.pdp_generation_items from anon;
revoke all on public.pdp_generation_jobs from authenticated;
revoke all on public.pdp_generation_items from authenticated;
grant select on public.pdp_generation_jobs to authenticated;
grant select on public.pdp_generation_items to authenticated;

-- 팀 판정은 202609070003 의 함수를 그대로 쓴다. 같은 join 을 여기 또 적으면
-- 한 곳만 고치는 날이 온다.
drop policy if exists "team reads pdp jobs" on public.pdp_generation_jobs;
create policy "team reads pdp jobs"
  on public.pdp_generation_jobs for select to authenticated
  using (public.same_team(team_id, user_id));

-- 자식은 부모로 판정한다. **job ID 만 알아서는 못 읽는다.**
drop policy if exists "team reads pdp items" on public.pdp_generation_items;
create policy "team reads pdp items"
  on public.pdp_generation_items for select to authenticated
  using (exists (
    select 1 from public.pdp_generation_jobs j
    where j.id = pdp_generation_items.job_id
      and public.same_team(j.team_id, j.user_id)
  ));

-- ── 4. 예약 갱신 ─────────────────────────────────────────────────────
--
-- 예약은 10분 뒤 만료된다(`reserve_generation`). 워커가 더 오래 도는 작업을
-- 그 로직에 그대로 맡기면, 아직 만들고 있는데 예약이 풀려 다음 요청이
-- `concurrent_limit` 에 걸린다.
--
-- **살아 있는 워커의 것만 늘린다.** 사용자의 예약 전부가 아니라 이 작업의
-- 예약만이다(설계 §8.4). job ID 와 lease 주인이 맞아야 한다.

create or replace function public.renew_pdp_job_lease(
  p_job_id uuid,
  p_worker text,
  p_lease_seconds integer default 120,
  p_reservation_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.pdp_generation_jobs%rowtype;
begin
  select * into v_job from public.pdp_generation_jobs
    where id = p_job_id for update;
  if not found then return false; end if;

  -- 남의 lease 는 못 늘린다. 죽은 워커의 것을 이어받으려면 다시 claim 해야 한다.
  if v_job.lease_owner is distinct from p_worker then return false; end if;
  if v_job.lease_until is null or v_job.lease_until <= now() then return false; end if;

  update public.pdp_generation_jobs
    set lease_until = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
        updated_at = now()
    where id = p_job_id;

  -- **이 작업의 예약만** 늘린다. 아직 안 끝난 것만.
  update public.generation_events
    set expires_at = now() + make_interval(secs => greatest(p_reservation_seconds, 60))
    where user_id = v_job.user_id
      and request_id = v_job.reservation_request_id
      and status = 'reserved';

  return true;
end;
$$;

revoke all on function public.renew_pdp_job_lease(uuid, text, integer, integer) from public;
revoke all on function public.renew_pdp_job_lease(uuid, text, integer, integer) from anon;
revoke all on function public.renew_pdp_job_lease(uuid, text, integer, integer) from authenticated;

-- ── 5. 늦은 정산 ─────────────────────────────────────────────────────
--
-- 예약이 만료된 뒤에 결과가 나오는 경우가 있다. 지금은 `finalize_generation` 이
-- 그 행을 건드리지 않으므로(`status = 'reserved'` 가 아니다) **결과는 있는데
-- 차감이 안 된다.**
--
-- 자동으로 새 예약을 만들지 않는다 — 그것은 「새 생성 요청으로 위장」이다
-- (설계 §8.4). 만료된 그 행을 **한 번만** 성공으로 고쳐 적는다. 근거는 서버가
-- 보관한 실제 job 결과이고, 서비스 역할만 부를 수 있다.

create or replace function public.settle_expired_pdp_job(
  p_job_id uuid,
  p_consumed_units integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.pdp_generation_jobs%rowtype;
  v_event public.generation_events%rowtype;
begin
  select * into v_job from public.pdp_generation_jobs where id = p_job_id;
  if not found then return false; end if;

  -- 실제로 만들어 낸 것이 있어야 한다. 결과 없는 작업에 돈을 매기지 않는다.
  if not exists (
    select 1 from public.pdp_generation_items
    where job_id = p_job_id and output_path is not null
  ) then
    return false;
  end if;

  select * into v_event from public.generation_events
    where user_id = v_job.user_id and request_id = v_job.reservation_request_id
    for update;
  if not found then return false; end if;

  -- **한 번만.** 이미 성공으로 닫힌 건 다시 세지 않는다.
  if v_event.status = 'succeeded' then return false; end if;
  -- 만료로 닫힌 것만 되살린다. 그 밖의 실패는 사람이 볼 일이다.
  if v_event.status <> 'failed' or v_event.error_code is distinct from 'reservation_expired' then
    return false;
  end if;

  update public.generation_events
    set status = 'succeeded',
        consumed_units = least(greatest(p_consumed_units, 0), requested_units),
        error_code = null,
        completed_at = now()
    where id = v_event.id;

  return true;
end;
$$;

revoke all on function public.settle_expired_pdp_job(uuid, integer) from public;
revoke all on function public.settle_expired_pdp_job(uuid, integer) from anon;
revoke all on function public.settle_expired_pdp_job(uuid, integer) from authenticated;

-- ── 확인 ─────────────────────────────────────────────────────────────
--
--   -- 표와 제약
--   select table_name from information_schema.tables
--    where table_schema = 'public' and table_name like 'pdp_generation%';
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.pdp_generation_jobs'::regclass;
--
--   -- 회원은 읽기만 되는가 (insert 가 거부되어야 한다)
--   select has_table_privilege('authenticated', 'public.pdp_generation_jobs', 'INSERT');
--   -- false 여야 한다
--
--   -- 함수는 회원에게 닫혀 있는가
--   select has_function_privilege('authenticated',
--     'public.settle_expired_pdp_job(uuid, integer)', 'EXECUTE');
--   -- false 여야 한다
--
-- 되돌리기:
--   drop function if exists public.settle_expired_pdp_job(uuid, integer);
--   drop function if exists public.renew_pdp_job_lease(uuid, text, integer, integer);
--   drop table if exists public.pdp_generation_items;
--   drop table if exists public.pdp_generation_jobs;
