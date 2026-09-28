-- ════════════════════════════════════════════════════════════════════
--  CS 도우미 물음을 장부에 들인다
--  (2026-09-23 사용자 요청, 설계 2026-09-23-cs-ai-bot-design.md §6.4)
--
--  ── 무엇을 하나 ───────────────────────────────────────────────────
--
--  화면 왼쪽 아래 도우미에게 묻는 한 번을 `cs_ask` 로 센다.
--
--    · **크레딧은 0 장이다.** 그림을 안 만든다
--    · **그래도 값은 나간다** — 글 모델(claude-sonnet-5)과 임베딩
--    · 이 저장소는 「값이 나가는데 장부에 0 원」인 자리를 세 번 고쳤다
--      (`reference_analyze`·`redesign_transcribe`·`pdp_analyze`).
--      이번에는 처음부터 싣는다
--
--  ── 왜 칸을 나누나 ────────────────────────────────────────────────
--
--  물음은 값싸고 자주 온다. 기획(시간당 열 번)과 같은 칸을 쓰면 **몇 번
--  물어보고 나면 그날 상세페이지를 못 만든다.** 세는 방식만 같이 쓰고 칸은
--  나눈다. 한도 값은 앱이 넣어 준다(`lib/membership/hourly-limit.ts`).
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--    1. `generation_events.operation` 의 check 에 `cs_ask` 를 더한다
--    2. `reserve_generation()` 의 화이트리스트에도 같은 값을 더한다
--    3. 시간당 세는 갈래에 같은 값을 더한다
--
--  **1과 2를 함께 해야 한다.** 2026-09-08 에 1만 하고 2를 빠뜨려서 이미지
--  만들기와 카드뉴스가 전부 `invalid_request` 로 거절됐다.
--
--  나머지는 202609210001 판 그대로다.
--
--  **이 파일 하나만 돌려도 된다.** 앞선 판들의 내용을 모두 품고 있다.
--
--  순서: 이 SQL 을 먼저 → 그다음 코드 배포.
--        뒤바뀌면 도우미가 「사용량을 확인하지 못했습니다」로 막힌다.
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
    'redesign_transcribe',
    -- 화면 왼쪽 아래 도우미에게 묻는 한 번. 크레딧은 0 이고 원가는 글 모델과
    -- 임베딩 값뿐이다.
    'cs_ask'
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
       'reference_analyze', 'redesign_transcribe', 'cs_ask'
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
  if p_operation in ('pdp_analyze', 'reference_analyze', 'redesign_transcribe', 'cs_ask') then
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


-- ── 4. 장부 쪽 예약 함수에도 같은 값을 더한다 ────────────────────────
--
--  **이것을 빠뜨리면 아무것도 안 바뀐다.** 크레딧 장부가 켜져 있으면
--  (`CREDIT_LEDGER`) 앱은 `reserve_generation` 이 아니라
--  `credit_reserve_dispatch` → `credit_reserve` 를 부른다
--  (`lib/membership/api.ts:100`). 위에서 `reserve_generation` 만 고치면
--  도우미가 `invalid_credit_quote` 로 거절된다.
--
--  2026-09-08 에 check 제약만 고치고 화이트리스트를 빠뜨려 이미지 만들기와
--  카드뉴스가 전부 막혔다. 같은 실수를 한 자리 옆에서 되풀이하지 않는다.
--
--  202609220001 판을 그대로 옮기고 `cs_ask` 한 낱말만 더했다.

create or replace function public.credit_reserve(p_user uuid,p_request uuid,p_operation text,p_outputs integer[],p_resource text,p_analysis_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; g credit_grants%rowtype; v_need integer; v_left integer; v_take integer; v_team uuid; v_cap integer; v_team_used integer; v_state jsonb;
  v_analysis_limit integer := least(greatest(p_analysis_limit,1),1000); v_recent integer;
  -- 모델이 일한 흔적이 없는 실패. 202609200002 의 목록과 같아야 한다.
  v_exempt_codes text[] := array['AI_KEY_MISSING','AI_KEY_INVALID','AI_MODEL_ACCESS_DENIED','AI_QUOTA_EXCEEDED','AI_PROVIDER_UNAVAILABLE','INVALID_IMAGE_PAYLOAD','reservation_expired'];
begin
  perform credit_lock();
  select * into p from profiles where id=p_user for update;
  if not found or p.status<>'active' or p.email_confirmed_at is null then return jsonb_build_object('allowed',false,'reason','inactive_member'); end if;
  if not exists(select 1 from credit_accounts where user_id=p_user) then return jsonb_build_object('allowed',false,'reason','credit_account_not_activated'); end if;
  if p_request is null or p_operation not in ('pdp_analyze','reference_analyze','redesign_transcribe','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image','ad_export','cs_ask') or p_outputs is null or cardinality(p_outputs)>60 or exists(select 1 from unnest(p_outputs) u where u is null or u not in(1,2)) or length(trim(coalesce(p_resource,'')))=0 then raise exception 'invalid_credit_quote'; end if;
  select coalesce(sum(u),0)::integer into v_need from unnest(p_outputs) u;
  if v_need>max_reserve_units() then return jsonb_build_object('allowed',false,'reason','invalid_request'); end if;
  perform credit_ensure_paid_period(p_user); v_state:=credit_wallet_state(p_user);
  if exists(select 1 from generation_events where user_id=p_user and request_id=p_request) then return jsonb_build_object('allowed',false,'reason','duplicate_request','usage',v_state); end if;
  -- Holding credits and blocking the member are different decisions. A hold survives expiry and
  -- settlement review by design; the block must not, or an abandoned request locks the account
  -- until an administrator notices. Only a live, unreviewed request blocks the next one.
  if v_need>0 and exists(select 1 from generation_events where user_id=p_user and pricing_policy='image-v2' and status='reserved' and requested_units>0 and expires_at>now() and credit_phase is distinct from 'needs_review') then return jsonb_build_object('allowed',false,'reason','concurrent_limit','usage',v_state); end if;
  /*
    **시간당 한도는 작업 종류별로 센다.** 한도 값은 앱이 넣어 준다
    (`lib/membership/hourly-limit.ts`). 옛 경로와 같은 계약이라야 한다 — 정책
    스위치 하나로 회원이 다른 한도를 받으면 안 된다(202609200002).
  */
  if p_operation in ('pdp_analyze','reference_analyze','redesign_transcribe') then
    -- 값이 나간 시도만 센다. 아직 안 닫힌 행(error_code is null)은 센다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour'
        and coalesce(error_code,'') <> all (v_exempt_codes);
    if v_recent>=v_analysis_limit then return jsonb_build_object('allowed',false,'reason','analysis_rate_limit','usage',v_state); end if;
    -- 남용 천장. 면제받은 실패도 서버를 쓴다. 정상 사용은 여기 닿지 않는다.
    select count(*)::integer into v_recent from generation_events
      where user_id=p_user and operation=p_operation and created_at>now()-interval '1 hour';
    if v_recent>=v_analysis_limit*10 then return jsonb_build_object('allowed',false,'reason','analysis_abuse_limit','usage',v_state); end if;
  end if;
  if (v_state->>'available')::integer<v_need then return jsonb_build_object('allowed',false,'reason','quota_exceeded','usage',v_state); end if;
  select tm.team_id into v_team from team_members tm where tm.user_id=p_user;
  if v_team is not null then
    select monthly_quota into v_cap from teams where id=v_team and deleted_at is null;
    if v_cap>0 then
      select coalesce(sum(case when status='succeeded' then consumed_units when status='reserved' then requested_units else 0 end),0)::integer into v_team_used
        from generation_events where team_id=v_team and pricing_policy='image-v2' and period_start=credit_period_start();
      v_team_used:=v_team_used+coalesce((select case when credit_opening_period=credit_period_start() then credit_opening_used else 0 end from teams where id=v_team),0);
      if v_team_used+v_need>v_cap then return jsonb_build_object('allowed',false,'reason','team_quota_exceeded','usage',v_state); end if;
    end if;
  end if;
  insert into generation_events(user_id,request_id,operation,period_start,requested_units,expires_at,team_id,pricing_policy,credit_quote,credit_phase)
    values(p_user,p_request,p_operation,credit_period_start(),v_need,now()+interval '10 minutes',v_team,'image-v2',jsonb_build_object('policy','image-v2','version','2026-09-22.1','outputs',to_jsonb(p_outputs),'resource',p_resource),'reserved');
  v_left:=v_need;
  for g in select * from credit_grants where user_id=p_user and revoked_at is null and expires_at>now() and granted_units-consumed_units-reserved_units>0 order by expires_at,granted_at,id for update loop
    exit when v_left=0;
    v_take:=least(v_left,g.granted_units-g.consumed_units-g.reserved_units);
    update credit_grants set reserved_units=reserved_units+v_take where id=g.id;
    insert into credit_holds(user_id,request_id,grant_id,units) values(p_user,p_request,g.id,v_take);
    v_left:=v_left-v_take;
  end loop;
  if v_left<>0 then raise exception 'credit_reservation_invariant'; end if;
  return jsonb_build_object('allowed',true,'reason','ok','usage',credit_wallet_state(p_user),'policy','image-v2');
end $$;
