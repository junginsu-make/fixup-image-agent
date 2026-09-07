-- 크레딧을 팀 몫으로 합친다.
--
-- 돈이 오가는 자리라 나머지가 다 선 뒤에 손댄다. 이것이 마지막 단계다.
--
-- ── 오늘도 아무 일이 안 일어나야 한다 ─────────────────────────────
--
-- 팀이 없는 사람은 **한 줄도 안 바뀐다.** 팀에 든 사람도 `teams.monthly_quota`
-- 가 0 이면 지금과 똑같다 — 0 은 「아직 안 정했다」는 뜻이고, 그 뜻은 1단계에
-- 표를 만들 때 적어 두었다.
--
-- **팀을 만든 순간 쓸 수 있는 양이 줄면 그건 사고다.** 그래서 팀 한도를
-- 자동으로 채우지 않는다. 팀장이 크레딧 화면에서 값을 정하는 그 순간부터
-- 팀 한도가 걸린다. 0 인 채로 두면 개인 상한만 본다.
--
-- 설계: 팀 워크스페이스 구현 설계 (2026-09-07) 결정 3 · 6단계

-- ── 상한이 두 곳에 있는 것을 없앤다 ───────────────────────────────
--
-- 2026-07-27 에 함수의 검사를 10 에서 60 으로 올리면서 「바뀌는 것은 함수의
-- 상한 한 곳뿐이다」라고 적었는데, 그 말이 틀렸다. 표의 check 는 10 그대로였다.
-- 그래서 11 이상을 예약하면 함수는 통과시키고 표가 막아, 사용자에게는
-- 「사용량을 확인하지 못했습니다」만 떴다. 2026-09-04 에 실제로 터졌다.
--
-- 그때는 표의 값을 60 으로 맞추는 것으로 껐다. **두 곳이 그대로 남아 있으니
-- 다음에 올릴 때 또 갈린다.** 이번에 한 곳으로 만든다.
--
-- `immutable` 이라야 check 제약이 부를 수 있다. 값을 바꿀 때는 이 함수만
-- 고치면 되고, 이미 들어간 행은 다시 검사하지 않는다 — 상한을 올리는 쪽으로만
-- 바꾸므로 그래도 된다. 내리려면 그때는 기존 행을 어떻게 할지 따로 정해야 한다.
create or replace function public.max_reserve_units()
returns integer
language sql
immutable
as $$ select 60 $$;

comment on function public.max_reserve_units() is
  '한 번에 예약할 수 있는 units 상한. 함수와 표의 check 가 이 하나를 본다.';

alter table public.generation_events
  drop constraint if exists generation_events_requested_units_check;

alter table public.generation_events
  add constraint generation_events_requested_units_check
  check (requested_units >= 0 and requested_units <= public.max_reserve_units());

-- ── 팀 크레딧 ─────────────────────────────────────────────────────

-- 이번 달 이 팀이 쓴 것과 잡아 둔 것. `p_exclude_user` 는 「나 말고」다.
--
-- 나를 빼고 세는 이유. 부르는 쪽이 내 사용량과 합쳐서 한 번만 비교하게 하려는
-- 것이다. 내 것까지 넣어 세면 아래에서 내 것을 두 번 더하게 된다.
create or replace function public.team_units_used(
  p_team_id uuid,
  p_period_start date,
  p_exclude_user uuid
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case
      when status = 'succeeded' then consumed_units
      when status = 'reserved' and expires_at > now() then requested_units
      else 0
    end
  ), 0)::integer
  from public.generation_events
  where team_id = p_team_id
    and period_start = p_period_start
    and user_id is distinct from p_exclude_user;
$$;

/*
 * 이 사람이 이번 달에 쓸 수 있는 최대치.
 *
 * 팀이 없거나 팀 한도가 0 이면 **개인 상한 그대로**다. 오늘 도는 길이 이쪽이다.
 *
 * 팀이 있으면 `min(개인 상한, 팀 한도 − 팀원들이 이미 쓴 것)` 이다. 팀원이
 * 많이 쓸수록 내 천장이 내려간다 — 그것이 「크레딧을 팀에 합친다」의 뜻이다.
 *
 * 남은 값이 음수면 0 으로 자른다. 팀 한도를 나중에 내리면 이미 쓴 것이 더
 * 많을 수 있는데, 음수를 그대로 돌려주면 비교하는 쪽이 이상해진다.
 *
 * **못 찾으면 개인 상한으로 떨어진다.** 접힌 팀에 든 사람은 안쪽 select 가 한
 * 줄도 못 찾아 null 이 되는데, null 을 그대로 두면 비교가 전부 거짓이 되어
 * 아무것도 못 만든다. 팀을 접었다고 사람이 멈추면 안 된다.
 */
create or replace function public.effective_quota(
  p_user_id uuid,
  p_team_id uuid,
  p_personal_quota integer,
  p_period_start date
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    case
      when p_team_id is null then p_personal_quota
      else (
        select case
          when t.monthly_quota = 0 then p_personal_quota
          else least(
            p_personal_quota,
            greatest(0, t.monthly_quota - public.team_units_used(p_team_id, p_period_start, p_user_id))
          )
        end
        from public.teams t
        where t.id = p_team_id and t.deleted_at is null
      )
    end,
    p_personal_quota
  );
$$;

-- ── 예약 ──────────────────────────────────────────────────────────
--
-- 바뀌는 것은 넷이다. 나머지는 2026-07-27 판 그대로 둔다 — 돈이 오가는 자리에
-- 「하는 김에」를 섞지 않는다.
--
--   1. 상한 60 을 `max_reserve_units()` 로 바꾼다
--   2. 이 사람의 팀을 찾는다
--   3. 개인 상한 대신 `effective_quota()` 로 비교한다
--   4. 기록에 `team_id` 를 적는다 — 이게 있어야 다음 달에도 셀 수 있다
--
-- 막힌 이유를 팀 때문인지 갈라서 돌려준다. 「내 한도를 늘려 달라」고 운영자에게
-- 말해도 안 풀리는 상황이라, 같은 `quota_exceeded` 로 뭉뚱그리면 사용자가
-- 엉뚱한 곳을 두드린다.
create or replace function public.reserve_generation(
  p_user_id uuid,
  p_request_id uuid,
  p_operation text,
  p_units integer,
  p_analysis_limit integer default 10
)
returns table (
  allowed boolean,
  reason text,
  used_units integer,
  reserved_units integer,
  quota integer,
  current_period_start date,
  current_period_end date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_period_start date := date_trunc('month', now() at time zone 'Asia/Seoul')::date;
  v_period_end date := (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date;
  v_used integer := 0;
  v_reserved integer := 0;
  v_recent_analysis integer := 0;
  v_inflight integer := 0;
  v_team_id uuid;
  v_quota integer;
begin
  if p_operation not in ('pdp_analyze', 'pdp_image', 'redesign_generate', 'redesign_edit')
     or p_units < 0 or p_units > public.max_reserve_units() then
    return query select false, 'invalid_request', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    return query select false, 'profile_not_found', 0, 0, 0, v_period_start, v_period_end;
    return;
  end if;

  select tm.team_id into v_team_id
    from public.team_members tm where tm.user_id = p_user_id;
  v_quota := public.effective_quota(p_user_id, v_team_id, v_profile.monthly_quota, v_period_start);

  if v_profile.email_confirmed_at is null then
    return query select false, 'email_unconfirmed', 0, 0, v_quota, v_period_start, v_period_end;
    return;
  end if;
  if v_profile.status <> 'active' then
    return query select false, v_profile.status, 0, 0, v_quota, v_period_start, v_period_end;
    return;
  end if;

  update public.generation_events
    set status = 'failed', completed_at = now(), error_code = 'reservation_expired'
    where user_id = p_user_id and status = 'reserved' and expires_at <= now();

  if exists (
    select 1 from public.generation_events
    where user_id = p_user_id and request_id = p_request_id
  ) then
    select coalesce(sum(consumed_units), 0)::integer into v_used
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
    select coalesce(sum(requested_units), 0)::integer into v_reserved
      from public.generation_events
      where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();
    return query select false, 'duplicate_request', v_used, v_reserved, v_quota, v_period_start, v_period_end;
    return;
  end if;

  if p_operation = 'pdp_analyze' then
    select count(*)::integer into v_recent_analysis
      from public.generation_events
      where user_id = p_user_id
        and operation = 'pdp_analyze'
        and created_at > now() - interval '1 hour'
        and error_code is distinct from 'reservation_expired';
    if v_recent_analysis >= least(greatest(p_analysis_limit, 1), 1000) then
      return query select false, 'analysis_rate_limit', 0, 0, v_quota, v_period_start, v_period_end;
      return;
    end if;
  elsif p_units > 0 then
    select count(*)::integer into v_inflight
      from public.generation_events
      where user_id = p_user_id and status = 'reserved' and expires_at > now() and requested_units > 0;
    if v_inflight >= 1 then
      return query select false, 'concurrent_limit', 0, 0, v_quota, v_period_start, v_period_end;
      return;
    end if;
  end if;

  select coalesce(sum(consumed_units), 0)::integer into v_used
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'succeeded';
  select coalesce(sum(requested_units), 0)::integer into v_reserved
    from public.generation_events
    where user_id = p_user_id and period_start = v_period_start and status = 'reserved' and expires_at > now();

  if v_used + v_reserved + p_units > v_quota then
    -- 팀 때문에 막혔나. 개인 상한만 봤으면 통과했을 것이면 팀 탓이다.
    return query select
      false,
      case
        when v_used + v_reserved + p_units <= v_profile.monthly_quota then 'team_quota_exceeded'
        else 'quota_exceeded'
      end,
      v_used, v_reserved, v_quota, v_period_start, v_period_end;
    return;
  end if;

  insert into public.generation_events (
    user_id, request_id, operation, period_start, requested_units, expires_at, team_id
  ) values (
    p_user_id, p_request_id, p_operation, v_period_start, p_units, now() + interval '10 minutes', v_team_id
  );

  return query select true, 'ok', v_used, v_reserved + p_units, v_quota, v_period_start, v_period_end;
end;
$$;

-- ── 화면에 보이는 숫자도 같은 답을 내야 한다 ──────────────────────
--
-- 「남은 크레딧」이 예약이 실제로 허락하는 것과 다르면, 화면에는 40 이 남았다고
-- 뜨는데 만들면 막힌다. 그 상태는 고장으로 보인다.
create or replace function public.member_usage_summary(p_user_id uuid)
returns table (
  used_units bigint,
  reserved_units bigint,
  quota integer,
  current_period_start date,
  current_period_end date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(sum(events.consumed_units) filter (where events.status = 'succeeded'), 0)::bigint,
    coalesce(sum(events.requested_units) filter (
      where events.status = 'reserved' and events.expires_at > now()
    ), 0)::bigint,
    public.effective_quota(
      profiles.id,
      (select tm.team_id from public.team_members tm where tm.user_id = profiles.id),
      profiles.monthly_quota,
      date_trunc('month', now() at time zone 'Asia/Seoul')::date
    ),
    date_trunc('month', now() at time zone 'Asia/Seoul')::date,
    (date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month')::date
  from public.profiles profiles
  left join public.generation_events events
    on events.user_id = profiles.id
   and events.period_start = date_trunc('month', now() at time zone 'Asia/Seoul')::date
  where profiles.id = p_user_id
  group by profiles.id, profiles.monthly_quota;
$$;

-- ── 권한 ──────────────────────────────────────────────────────────
--
-- 회원 브라우저에는 열지 않는다. 팀 한도와 팀원 사용량을 직접 물을 수 있으면
-- 남의 팀 사정이 새 나간다. 서버만 부른다.
revoke all on function public.team_units_used(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.effective_quota(uuid, uuid, integer, date) from public, anon, authenticated;
grant execute on function public.team_units_used(uuid, date, uuid) to service_role;
grant execute on function public.effective_quota(uuid, uuid, integer, date) to service_role;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- 팀 한도를 전부 0 으로 두면 이 마이그레이션을 안 돌린 것과 같게 동작한다.
-- 그것으로 부족하면 아래로 함수를 되돌린다. **표의 check 를 먼저 되돌려야**
-- `max_reserve_units()` 를 지울 수 있다.
--
-- alter table public.generation_events
--   drop constraint if exists generation_events_requested_units_check;
-- alter table public.generation_events
--   add constraint generation_events_requested_units_check
--   check (requested_units >= 0 and requested_units <= 60);
-- (그다음 202607270001 과 202607230001 의 함수 정의를 다시 돌린다)
-- drop function if exists public.effective_quota(uuid, uuid, integer, date);
-- drop function if exists public.team_units_used(uuid, date, uuid);
-- drop function if exists public.max_reserve_units();
