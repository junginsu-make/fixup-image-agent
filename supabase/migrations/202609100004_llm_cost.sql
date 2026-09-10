-- 글 모델 값을 장부에 담는다.
--
-- 지금까지 원가는 **그림만** 셌다(`billable_images × unit_cost_usd`). 글 모델
-- 값은 담을 칸이 없어서, 쓰기는 쓰는데 어디에도 안 남았다. 분석·기획만
-- 반복하는 사용은 장부에서 $0 으로 보인다 — 실제로는 회당 $0.03 쯤 나간다.
--
-- 크레딧 차감에는 이미 반영돼 있었다(`llmCostUsd` 를 더해 예약·확정했다).
-- 빠진 것은 **우리가 얼마를 냈는지**다. 요금을 정하려면 그 값이 있어야 한다.

alter table public.generation_events
  -- 소수 여섯 자리. 한 번은 $0.0001 이라도 수천 번이면 보인다.
  add column if not exists llm_usd numeric(12, 6) not null default 0
    check (llm_usd >= 0);

-- ── 집계에 더한다 ─────────────────────────────────────────────────
--
-- 그림값과 **더해서** 한 숫자로 준다. 화면이 「원가」라고 부르는 것이 실제로
-- 나간 돈 전부여야 한다. 나누어 보고 싶으면 `llm_usd` 를 따로 읽으면 된다.

create or replace function public.admin_cost_summary()
returns table (
  today_usd     numeric,
  month_usd     numeric,
  total_usd     numeric,
  today_images  bigint,
  month_images  bigint,
  total_images  bigint,
  wasted_usd    numeric,
  wasted_images bigint
)
language sql
security definer
set search_path = public
as $$
  with priced as (
    select
      e.created_at,
      e.status,
      e.billable_images,
      e.billable_images * coalesce(p.unit_cost_usd, 0) + coalesce(e.llm_usd, 0) as usd
    from public.generation_events e
    left join public.model_prices p on p.model = e.model
  )
  select
    coalesce(sum(usd) filter (where created_at >= date_trunc('day', now())), 0),
    coalesce(sum(usd) filter (where created_at >= date_trunc('month', now())), 0),
    coalesce(sum(usd), 0),
    coalesce(sum(billable_images) filter (where created_at >= date_trunc('day', now())), 0),
    coalesce(sum(billable_images) filter (where created_at >= date_trunc('month', now())), 0),
    coalesce(sum(billable_images), 0),
    -- 만들어 놓고 회원에게 못 준 것. 우리는 돈을 냈고 회원은 안 썼다.
    coalesce(sum(usd) filter (where status = 'failed'), 0),
    coalesce(sum(billable_images) filter (where status = 'failed'), 0)
  from priced;
$$;

create or replace function public.admin_cost_by_operation(p_days integer default 30)
returns table (operation text, images bigint, usd numeric)
language sql
security definer
set search_path = public
as $$
  select
    e.operation,
    coalesce(sum(e.billable_images), 0),
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0) + coalesce(e.llm_usd, 0)), 0)
  from public.generation_events e
  left join public.model_prices p on p.model = e.model
  where e.created_at >= now() - make_interval(days => greatest(1, p_days))
  group by e.operation
  order by 3 desc;
$$;

create or replace function public.admin_cost_daily(p_days integer default 30)
returns table (usage_date date, images bigint, usd numeric, wasted_usd numeric)
language sql
security definer
set search_path = public
as $$
  with priced as (
    select
      e.created_at::date as usage_date,
      e.status,
      e.billable_images,
      e.billable_images * coalesce(p.unit_cost_usd, 0) + coalesce(e.llm_usd, 0) as usd
    from public.generation_events e
    left join public.model_prices p on p.model = e.model
    where e.created_at >= now() - make_interval(days => greatest(1, p_days))
  )
  select
    usage_date,
    coalesce(sum(billable_images), 0),
    coalesce(sum(usd), 0),
    coalesce(sum(usd) filter (where status = 'failed'), 0)
  from priced
  group by usage_date
  order by usage_date;
$$;

-- `admin_cost_by_model` 은 그대로 둔다. 글 모델은 그림 모델 목록에 없어서
-- 여기에 더하면 「어느 그림 모델이 얼마」라는 뜻이 깨진다.
