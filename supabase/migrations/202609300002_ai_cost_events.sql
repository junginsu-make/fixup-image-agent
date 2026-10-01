-- AI 호출마다 비용 한 줄 (설계 2026-09-30 §3.4 · C3).
--
-- 지금 원가는 요청 끝에 `generation_events.llm_usd` + `billable_images × model_prices` 로 적는다.
-- 계량기 밖 호출(카드뉴스 상태 조회의 검수·웹검색 조사·Apify·임베딩)과 여러 단계 작업은 빠진다.
-- 여기서는 **공급자를 부를 때마다 한 줄**을 남길 자리와, 그 줄을 쓰는 함수 하나를 더한다.
--
-- ⚠ 공유 DB — detail-page-studio 가 같은 Supabase 를 본다. **새 표·새 함수만 더한다.**
--   기존 표·함수(`generation_events`·`model_prices`·`admin_cost_*`·`reserve_generation`·`credit_*`)는
--   다시 정의하지 않는다.
-- ⚠ 순서 — **이 파일 먼저, 그다음 앱**(docs/DEPLOY.md 기본 순서). 앱이 먼저 나가면 쓰기가
--   「함수 없음」으로 실패하고 경고만 남는다(호출은 안 막는다). 그동안의 비용이 빠질 뿐이다.

create table if not exists public.ai_cost_events (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  -- 회원을 지워도 회사가 낸 돈은 남아야 한다. 그래서 profiles 에 묶지 않는다.
  user_id         uuid,
  -- 예약의 요청 식별자(x-idempotency-key). 관리자 지식 올리기처럼 예약 없는 자리는 비운다.
  request_id      uuid,
  -- 작업 키. 예약의 resource 에서 id 를 뺀 것(`sns:plan`, `poster:review`, `cs:ask` …).
  operation       text not null check (char_length(operation) between 1 and 80),
  provider        text not null check (provider in ('anthropic','openai','google','fal','apify','other')),
  model           text not null check (char_length(model) between 1 and 200),
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  images          integer not null default 0 check (images between 0 and 100),
  usd             numeric(12, 6) not null check (usd >= 0),
  usd_basis       text not null check (usd_basis in ('tokens','image_unit','provider_reported','estimate')),
  failed          boolean not null default false,
  -- fal 은 제출하면 과금이 끝난다. 같은 제출이 두 번 적히지 않게 막는다. 없으면 null(여럿 허용).
  fal_request_id  text unique
);

create index if not exists ai_cost_events_created_idx on public.ai_cost_events (created_at desc);

alter table public.ai_cost_events enable row level security;
revoke all on table public.ai_cost_events from public, anon, authenticated;

-- ── 한 줄 쓰기 ───────────────────────────────────────────────────
--
-- 그림(`image_unit`)은 **여기서** 값을 매긴다 — 단가는 관리자가 고치는 `model_prices` 에 있다.
-- 단가가 없는 모델이면 표에서 가장 비싼 값으로 잡고 근거를 `estimate` 로 남긴다
-- (적게 잡는 쪽이 위험하다 — `credit-cost.ts` 의 `imageUnitUsd` 와 같은 판단).
-- 글 모델·웹검색·Apify 는 앱이 금액을 계산해 넘긴다.

create or replace function public.ai_cost_record(
  p_user uuid,
  p_request uuid,
  p_operation text,
  p_provider text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_images integer,
  p_usd numeric,
  p_basis text,
  p_failed boolean,
  p_fal_request_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usd numeric := p_usd;
  v_basis text := p_basis;
  v_unit numeric;
begin
  if p_basis = 'image_unit' then
    select unit_cost_usd into v_unit from model_prices where model = p_model;
    if v_unit is null then
      select max(unit_cost_usd) into v_unit from model_prices;
      v_basis := 'estimate';
    end if;
    v_usd := coalesce(v_unit, 0) * greatest(coalesce(p_images, 0), 0);
  elsif v_usd is null then
    raise exception 'ai_cost_record: usd_required for basis %', p_basis;
  end if;

  insert into ai_cost_events(
    user_id, request_id, operation, provider, model,
    input_tokens, output_tokens, images, usd, usd_basis, failed, fal_request_id
  ) values (
    p_user, p_request, p_operation, p_provider, p_model,
    greatest(coalesce(p_input_tokens, 0), 0), greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_images, 0), 0), round(v_usd, 6), v_basis, coalesce(p_failed, false),
    nullif(btrim(coalesce(p_fal_request_id, '')), '')
  )
  on conflict (fal_request_id) do nothing;
end $$;

revoke all on function public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text) from public, anon, authenticated;
grant execute on function public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text) to service_role;

-- ── 하나인지 센다(42725 교훈) ──────────────────────────────────────
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_cost_record') <> 1 then
    raise exception 'ai_cost_record 가 하나가 아닙니다';
  end if;
  raise notice 'ai_cost_events 표와 ai_cost_record 함수 하나를 만들었습니다.';
end $$;

-- 확인(적용 뒤, 읽기만):
--   select to_regclass('public.ai_cost_events');
--   select has_table_privilege('anon', 'public.ai_cost_events', 'select');   -- false
--   select has_function_privilege('authenticated',
--     'public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text)', 'execute'); -- false
