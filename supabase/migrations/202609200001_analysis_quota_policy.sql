-- ════════════════════════════════════════════════════════════════════
--  못 만든 분석이 분석 한도를 먹지 않게 한다 (C-9)
--
--  ── 무엇이 문제였나 ───────────────────────────────────────────────
--
--  분석은 시간당 열 번으로 묶여 있다(ANALYZE_HOURLY_LIMIT). 그런데 그 수를
--  세는 이 함수는 **실패한 시도까지 함께 셌다.** 키가 안 꽂혀 있거나 공급자가
--  죽어 있어도 한 칸이 사라진다.
--
--  사용자는 아무것도 못 받고 한도만 잃는다. 운영자가 키를 빠뜨린 채 배포한 날,
--  사용자는 열 번 눌러 보고 **한 시간 동안 막힌다.**
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--  세는 기준을 둘로 가른다.
--
--    1. **한도**(p_analysis_limit): 모델이 실제로 일한 시도만 센다.
--       면제 목록은 packages/pdp-core/src/pdp.analysis-quota.ts 와 같다.
--       두 벌이 어긋나면 한도가 뚫리거나 멀쩡한 사용자가 한 시간을 기다린다.
--       apps/web/lib/membership/__tests__/analysis-quota-migration.test.ts 가
--       두 벌을 맞대 본다.
--
--    2. **남용 천장**: 면제 여부와 무관하게 모든 시도를 센다. 한도의 열 배다.
--       설계가 「정책 분리 수정, **남용 제한은 유지**」라 적은 자리가 여기다.
--       면제만 두면 실패를 만들어 내며 한도를 무한히 우회할 수 있다.
--
--  **사용자에게 가는 말은 같고, reason 은 가른다.** 할 일은 어느 쪽이든 「잠시
--  후 다시」로 같으니 화면 문구는 하나로 둔다. 다만 reason 까지 같게 두면
--  운영에서 어느 천장에 걸렸는지 알 길이 없다 — 한도를 올려야 하는 상황과
--  남용을 봐야 하는 상황은 할 일이 정반대다.
--
--  ── 무엇을 안 바꾸나 ──────────────────────────────────────────────
--
--  본문은 202609140001 판 그대로다. 작업 종류 화이트리스트, units 상한, 팀
--  한도(effective_quota), 동시 생성 제한, 월 한도 계산은 글자 그대로 같다.
--  돈이 오가는 자리에 「하는 김에」를 섞지 않는다.
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌어도 안전하다. 옛 코드는 error_code 를 덜 정확하게 남길 뿐이고,
--        이 함수는 덜 정확한 코드를 「먹는 쪽」으로 셀 뿐이다(지금과 같다).
--
--  여러 번 돌려도 안전하다. 기존 행은 건드리지 않는다.
--
--  되돌리려면 202609140001_ad_export_operation.sql 의 함수 정의를 다시 적용한다.
-- ════════════════════════════════════════════════════════════════════

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
  v_recent_attempts integer := 0;
  v_analysis_limit integer := least(greatest(p_analysis_limit, 1), 1000);
  v_inflight integer := 0;
  v_team_id uuid;
  v_quota integer;
  -- 모델이 일한 흔적이 없는 실패. pdp.analysis-quota.ts 의 목록과 같아야 한다.
  v_exempt_codes text[] := array[
    'AI_KEY_MISSING',
    'AI_KEY_INVALID',
    'AI_MODEL_ACCESS_DENIED',
    'AI_QUOTA_EXCEEDED',
    'AI_PROVIDER_UNAVAILABLE',
    'INVALID_IMAGE_PAYLOAD',
    'reservation_expired'
  ];
begin
  if p_operation not in (
       'pdp_analyze', 'pdp_image', 'redesign_generate', 'redesign_edit',
       'poster_image', 'sns_image', 'ad_export'
     )
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
    -- 값이 나간 시도만 센다. 아직 안 닫힌 행(error_code is null)은 센다.
    select count(*)::integer into v_recent_analysis
      from public.generation_events
      where user_id = p_user_id
        and operation = 'pdp_analyze'
        and created_at > now() - interval '1 hour'
        and coalesce(error_code, '') <> all (v_exempt_codes);
    if v_recent_analysis >= v_analysis_limit then
      return query select false, 'analysis_rate_limit', 0, 0, v_quota, v_period_start, v_period_end;
      return;
    end if;

    -- 남용 천장. 면제받은 실패도 서버를 쓴다. 정상 사용은 여기 닿지 않는다.
    select count(*)::integer into v_recent_attempts
      from public.generation_events
      where user_id = p_user_id
        and operation = 'pdp_analyze'
        and created_at > now() - interval '1 hour';
    if v_recent_attempts >= v_analysis_limit * 10 then
      return query select false, 'analysis_abuse_limit', 0, 0, v_quota, v_period_start, v_period_end;
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

-- 확인:
--   -- 면제 코드가 한도를 안 먹는지
--   select error_code, count(*)
--   from public.generation_events
--   where operation = 'pdp_analyze' and created_at > now() - interval '1 hour'
--   group by 1 order by 2 desc;
