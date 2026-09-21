-- ════════════════════════════════════════════════════════════════════
--  레퍼런스 분석을 장부에 들인다 (C-4-b · C-7 의 「횟수」)
--
--  ── 무엇이 문제였나 ───────────────────────────────────────────────
--
--  레퍼런스를 올리면 그림을 읽어 서술을 만든다(Gemini 한 번). **그 돈이 장부에
--  한 줄도 없었다.** 예약도 없어서 횟수 제한도 없다. 같은 그림을 천 번 올려도
--  막는 것이 아무것도 없었다.
--
--  설계 §7.2: 「기획·**레퍼런스 분석**·전사 성공/실패를 LLM meter 에 연결한다.
--  이미지 크레딧 0 이어도 원가 기록은 남긴다.」
--  설계 §7.2: 「현재 시간당 분석 제한 설정은 재사용하고 **레퍼런스 분석**·전사
--  에도 명시된 LLM 작업 한도를 적용한다.」
--  설계 §12: 「무제한 AI 분석·업로드는 회원별 rate/용량 정책에 연결한다.」
--
--  ── 왜 `pdp_analyze` 를 같이 쓰지 않나 ────────────────────────────
--
--  칸을 나눠 쓰면 **레퍼런스를 정리하다가 상세페이지를 못 만들게 된다.**
--  상세페이지 분석은 시간당 열 번인데, 레퍼런스는 한자리에서 스무 장을 올리는
--  일이 정상이다. 하는 일도, 쓰는 돈의 크기도 다르다.
--
--  그래서 작업 종류를 따로 두고, **세는 방식만 같이 쓴다.** 한도 값은 앱이
--  작업 종류에 맞는 것을 넣어 준다(`lib/membership/api.ts`).
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--    1. `generation_events.operation` 의 check 에 `reference_analyze` 를 더한다
--    2. `reserve_generation()` 의 화이트리스트에도 같은 값을 더한다
--    3. 시간당 세는 갈래를 **작업 종류별로** 센다 (`operation = p_operation`)
--
--  **1과 2를 함께 해야 한다.** 2026-09-08 에 1만 하고 2를 빠뜨려서 이미지
--  만들기와 카드뉴스가 전부 `invalid_request` 로 거절됐다. 둘 중 좁은 쪽이
--  실제 한계다.
--
--  나머지는 202609200001 판 그대로다. 면제 목록·남용 천장·팀 한도·동시 생성
--  제한·월 한도 계산이 글자 그대로 같다.
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌면 레퍼런스 등록이 「사용량을 확인하지 못했습니다」로 막힌다.
--
--  여러 번 돌려도 안전하다. 기존 행은 건드리지 않는다.
-- ════════════════════════════════════════════════════════════════════

alter table public.generation_events
  drop constraint if exists generation_events_operation_check;

alter table public.generation_events
  add constraint generation_events_operation_check
  check (operation in (
    'pdp_analyze',
    'pdp_image',
    'redesign_generate',
    'redesign_edit',
    'poster_image',
    'sns_image',
    'ad_export',
    -- 레퍼런스를 올릴 때 그림을 읽어 서술을 만드는 호출. 크레딧은 0 이고
    -- 원가는 글 모델 값뿐이다.
    'reference_analyze'
  ));

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
       'poster_image', 'sns_image', 'ad_export',
       'reference_analyze'
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

  /*
    **시간당 한도는 작업 종류별로 센다.**

    전에는 `pdp_analyze` 만 셌다. 레퍼런스 분석이 같은 칸을 쓰면, 레퍼런스를
    정리하다가 상세페이지를 못 만들게 된다 — 하는 일도 값의 크기도 다르다.
    세는 방식만 같이 쓰고 칸은 나눈다. 한도 값은 앱이 넣어 준다.
  */
  if p_operation in ('pdp_analyze', 'reference_analyze') then
    -- 값이 나간 시도만 센다. 아직 안 닫힌 행(error_code is null)은 센다.
    select count(*)::integer into v_recent_analysis
      from public.generation_events
      where user_id = p_user_id
        and operation = p_operation
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
        and operation = p_operation
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
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.generation_events'::regclass
--     and conname = 'generation_events_operation_check';
--   select operation, count(*) from public.generation_events
--   where created_at > now() - interval '1 day' group by 1;
