-- 실제 비용 추적.
--
-- 지금까지 남긴 것은 '단위'뿐이다. 모델마다 4·3·1장으로 가중치를 뒀지만 그건
-- 회원에게 차감할 몫이지 우리가 낸 돈이 아니다. 무엇보다 **어떤 모델을 썼는지
-- 기록하지 않아서**, 지난 사용분은 비용으로 환산할 방법이 없다.
--
-- 여기서 세 가지를 더한다.
--   1) 사건마다 모델과 실제 만들어진 장수를 남긴다
--   2) 모델별 단가표를 두고 관리자가 고칠 수 있게 한다
--   3) 환율 같은 운영 설정을 담을 자리를 만든다
--
-- 비용은 저장하지 않고 조회할 때 단가표와 곱한다. 단가를 고치면 지난 기록의
-- 금액도 함께 맞춰진다 — 처음 넣는 값이 공개 단가라 나중에 청구서로 바로잡을
-- 것이기 때문이다.

-- ── 1. 사건에 모델과 장수를 남긴다 ─────────────────────────────────

alter table public.generation_events
  add column if not exists model text,
  -- fal 이 실제로 만들어 낸 장수. 회원 차감(consumed_units)과 다르다 —
  -- 실패해서 회원에게 안 물린 장도 우리는 돈을 냈다.
  add column if not exists billable_images integer not null default 0
    check (billable_images >= 0 and billable_images <= 100);

create index if not exists generation_events_model_created_idx
  on public.generation_events (model, created_at desc);

-- ── 2. 모델별 단가 ────────────────────────────────────────────────

create table if not exists public.model_prices (
  model          text primary key,
  label          text not null,
  -- 이미지 한 장당 달러. fal 공개 단가(2026-07 조사)를 초깃값으로 둔다.
  unit_cost_usd  numeric(10, 5) not null check (unit_cost_usd >= 0),
  note           text,
  updated_at     timestamptz not null default now()
);

insert into public.model_prices (model, label, unit_cost_usd, note) values
  ('gpt-image-2',     'GPT Image 2',     0.21100, 'fal 공개 단가(1024²·high). 이 서비스는 1536² 이상으로 뽑아 실제로는 더 비쌀 수 있다.'),
  ('nano-banana-pro', 'Nano Banana Pro', 0.15000, 'fal 공개 단가'),
  ('nano-banana',     'Nano Banana',     0.03900, 'fal 공개 단가'),
  ('redesign-openai', '리디자인 · OpenAI', 0.19000, '리디자인 도구가 OpenAI 로 만들 때. 청구서로 확인 후 조정'),
  ('redesign-google', '리디자인 · Google', 0.13000, '리디자인 도구가 Google 로 만들 때. 청구서로 확인 후 조정')
on conflict (model) do nothing;

alter table public.model_prices enable row level security;
revoke all on public.model_prices from anon, authenticated;

-- ── 3. 운영 설정 (환율 등) ────────────────────────────────────────

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values ('usd_krw', '1380')
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- ── 4. 집계 ───────────────────────────────────────────────────────
--
-- 단가표가 없는 모델(옛 기록처럼 model 이 비어 있는 것)은 0원으로 잡힌다.
-- 없는 값을 그럴듯하게 지어내는 것보다 0으로 두고 장수로 드러나는 편이 낫다.

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
      e.billable_images * coalesce(p.unit_cost_usd, 0) as usd
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

create or replace function public.admin_cost_by_member(p_user_ids uuid[])
returns table (user_id uuid, month_usd numeric, total_usd numeric, total_images bigint)
language sql
security definer
set search_path = public
as $$
  select
    e.user_id,
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0))
      filter (where e.created_at >= date_trunc('month', now())), 0),
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0)), 0),
    coalesce(sum(e.billable_images), 0)
  from public.generation_events e
  left join public.model_prices p on p.model = e.model
  where e.user_id = any(p_user_ids)
  group by e.user_id;
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
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0)), 0)
  from public.generation_events e
  left join public.model_prices p on p.model = e.model
  where e.created_at >= now() - make_interval(days => greatest(1, p_days))
  group by e.operation
  order by 3 desc;
$$;

create or replace function public.admin_cost_by_model(p_days integer default 30)
returns table (model text, label text, unit_cost_usd numeric, images bigint, usd numeric)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(e.model, '(기록 없음)'),
    coalesce(p.label, '단가 미등록'),
    coalesce(p.unit_cost_usd, 0),
    coalesce(sum(e.billable_images), 0),
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0)), 0)
  from public.generation_events e
  left join public.model_prices p on p.model = e.model
  where e.created_at >= now() - make_interval(days => greatest(1, p_days))
  group by 1, 2, 3
  order by 5 desc;
$$;

create or replace function public.admin_cost_daily(p_days integer default 30)
returns table (usage_date date, images bigint, usd numeric, wasted_usd numeric)
language sql
security definer
set search_path = public
as $$
  select
    e.created_at::date,
    coalesce(sum(e.billable_images), 0),
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0)), 0),
    coalesce(sum(e.billable_images * coalesce(p.unit_cost_usd, 0))
      filter (where e.status = 'failed'), 0)
  from public.generation_events e
  left join public.model_prices p on p.model = e.model
  where e.created_at >= now() - make_interval(days => greatest(1, p_days))
  group by 1
  order by 1;
$$;

revoke all on function public.admin_cost_summary() from public, anon, authenticated;
revoke all on function public.admin_cost_by_member(uuid[]) from public, anon, authenticated;
revoke all on function public.admin_cost_by_operation(integer) from public, anon, authenticated;
revoke all on function public.admin_cost_by_model(integer) from public, anon, authenticated;
revoke all on function public.admin_cost_daily(integer) from public, anon, authenticated;
