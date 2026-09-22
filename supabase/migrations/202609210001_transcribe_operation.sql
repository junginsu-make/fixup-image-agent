-- ════════════════════════════════════════════════════════════════════
--  전사를 장부에 들인다 (F-7-9)
--
--  ── 무엇이 문제였나 ───────────────────────────────────────────────
--
--  원본 상세페이지를 잘라 글 모델에게 받아쓰게 하는 호출(전사)에 **예약도
--  계량기도 본문 상한도 없었다.** 라우트는 로그인만 보고 `await req.json()`
--  한 줄이었다. 같은 페이지를 천 번 전사해도 막는 것이 없고, 그 돈은 운영
--  원가에서 $0 으로 보였다.
--
--  값이 작지 않다. 화면이 원본을 스트립 마흔 장까지 자르고 배치당 여덟 장씩
--  보내므로, **한 페이지를 전사하면 호출이 다섯 번까지** 간다.
--
--  설계 §7.2: 「기획·레퍼런스 분석·**전사** 성공/실패를 LLM meter 에 연결한다.
--  이미지 크레딧 0 이어도 원가 기록은 남긴다.」
--  설계 §7.2: 「현재 시간당 분석 제한 설정은 재사용하고 레퍼런스 분석·**전사**
--  에도 명시된 LLM 작업 한도를 적용한다.」
--
--  ── 왜 칸을 나누나 ────────────────────────────────────────────────
--
--  전사 한 번이 다섯 칸까지 먹는다. `pdp_analyze`(시간당 열 번) 와 같은 칸을
--  쓰면 **원본 한 장 전사하고 나면 그날 기획을 못 한다.** 세는 방식만 같이
--  쓰고 칸은 나눈다. 한도 값은 앱이 넣어 준다
--  (`lib/membership/hourly-limit.ts`, 기본 시간당 60).
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--    1. `generation_events.operation` 의 check 에 `redesign_transcribe` 를 더한다
--    2. `reserve_generation()` 의 화이트리스트에도 같은 값을 더한다
--    3. 시간당 세는 갈래에 같은 값을 더한다
--
--  **1과 2를 함께 해야 한다.** 2026-09-08 에 1만 하고 2를 빠뜨려서 이미지
--  만들기와 카드뉴스가 전부 `invalid_request` 로 거절됐다.
--
--  나머지는 202609200002 판 그대로다. 면제 목록·남용 천장·팀 한도·동시 생성
--  제한·월 한도 계산이 글자 그대로 같다.
--
--  **이 파일 하나만 돌려도 된다.** 202609200001·202609200002 의 내용을 모두
--  품고 있다. 셋을 순서대로 돌려도 결과는 같다.
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌면 전사가 「사용량을 확인하지 못했습니다」로 막힌다.
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
    'reference_analyze',
    -- 원본 상세페이지를 잘라 글 모델에게 받아쓰게 하는 호출. 크레딧은 0 이고
    -- 원가는 글 모델 값뿐이다. 한 페이지에 최대 다섯 번 간다.
    'redesign_transcribe'
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
       'reference_analyze', 'redesign_transcribe'
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
  if p_operation in ('pdp_analyze', 'reference_analyze', 'redesign_transcribe') then
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
