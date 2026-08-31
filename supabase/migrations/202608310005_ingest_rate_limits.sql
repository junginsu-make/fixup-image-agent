-- 수집 워커 사용자별 시간당 실행 상한.
-- 소스를 삭제하고 다시 등록해도 이 카운터는 남아 즉시 수집 반복을 막는다.

create table public.ingest_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  poll_count int not null default 0 check (poll_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_started_at)
);

alter table public.ingest_rate_limits enable row level security;

-- public 스키마 기본 권한을 걷는다. 이 원장은 service_role 워커만 쓴다.
revoke all on public.ingest_rate_limits from anon, authenticated;

create or replace function public.claim_ingest_poll_slot(
  p_user_id uuid,
  p_now timestamptz,
  p_limit int default 20
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', p_now at time zone 'UTC') at time zone 'UTC';
  v_count int;
begin
  if p_limit < 1 then
    raise exception 'p_limit must be positive';
  end if;

  insert into public.ingest_rate_limits (user_id, window_started_at, poll_count, updated_at)
  values (p_user_id, v_window, 1, p_now)
  on conflict (user_id, window_started_at) do update
    set poll_count = ingest_rate_limits.poll_count + 1,
        updated_at = p_now
    where ingest_rate_limits.poll_count < p_limit
  returning poll_count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.claim_ingest_poll_slot(uuid, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.claim_ingest_poll_slot(uuid, timestamptz, int)
  to service_role;
