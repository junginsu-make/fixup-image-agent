-- ════════════════════════════════════════════════════════════════════
--  AI 사용 통제 C1 — 멈춤 · 크레딧 없음 · CS 10회 · CS 시간당
--  (설계 docs/superpowers/specs/2026-09-30-ai-usage-control-design.md §3.2)
--
--  ⚠ **순서: 코드 배포를 먼저, 이 SQL 을 그다음에.** docs/DEPLOY.md 의 기본
--    순서(표부터)와 반대다. 이 파일은 칸·표를 더하지 않으므로 코드가 먼저
--    나가도 깨지는 것이 없다. 반대로 이 SQL 이 먼저면 옛 코드가 새 사유를 몰라
--    「요청을 처리할 수 없습니다」(409)만 보인다.
--
--  ⚠ 적용 전 확인 넷(설계 §6) — 하나라도 어긋나면 멈춘다.
--    1. 운영 credit_reserve 가 저장소 판(202609280001)과 같다
--    2. 장부 계정(credit_accounts) 없는 active 회원이 0 명
--    3. 서버 CREDIT_LEDGER=1
--    4. 관리자 두 계정이 모두 무제한(credit_is_unlimited)
--
--  ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
--  credit_reserve 하나만, **인자·이름 그대로** 교체한다. 인자가 하나라도
--  다르면 같은 이름 함수가 둘이 되어 모든 예약이 42725 로 막힌다(202609280003).
--  본문은 202609280001 판을 그대로 옮기고 ★ 자리만 더했다.
--
--    ★ AI 멈춤      app_settings.ai_paused='1' 이면 'ai_paused'. 관리자도 멈춘다
--    ★ 크레딧 없음  살아 있는 덩어리(회수 안 됨·만료 전)에 쓸 수 있거나 잡힌
--                   크레딧이 없으면 'credits_required'. 만료된 덩어리에 남은
--                   reserved_units(예: needs_review 로 못 푼 것)는 세지 않는다
--                   예외 — AI 없는 광고 내보내기(ad_export + 'ad:export')
--                        — CS 도우미(cs_ask)는 가입 후 통틀어 10건까지
--    ★ 시간당 한도 목록에 cs_ask (앱은 이미 CS_ASK_HOURLY_LIMIT 을 넘긴다)
--
--  공유 DB 의 다른 함수(옛 예약 함수·장부 분기 함수·비용 집계)는 건드리지
--  않는다 — detail-page-studio 가 같은 DB 를 쓴다.
--
--  여러 번 돌려도 같다.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.credit_reserve(p_user uuid,p_request uuid,p_operation text,p_outputs integer[],p_resource text,p_analysis_limit integer default 10)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p profiles%rowtype; g credit_grants%rowtype; v_need integer; v_left integer; v_take integer; v_team uuid; v_cap integer; v_team_used integer; v_state jsonb;
  v_analysis_limit integer := least(greatest(p_analysis_limit,1),1000); v_recent integer;
  -- 모델이 일한 흔적이 없는 실패. 202609200002 의 목록과 같아야 한다.
  v_exempt_codes text[] := array['AI_KEY_MISSING','AI_KEY_INVALID','AI_MODEL_ACCESS_DENIED','AI_QUOTA_EXCEEDED','AI_PROVIDER_UNAVAILABLE','INVALID_IMAGE_PAYLOAD','reservation_expired'];
  -- ★ AI 를 부르지 않는 단 하나의 예약 — 광고 내보내기의 자르기·줄이기(설계 §3.1).
  v_no_ai boolean := p_operation='ad_export' and p_resource='ad:export';
  -- ★ 크레딧 없는 회원이 가입 후 통틀어 쓴 도우미 물음 수(설계 §3.2).
  v_cs_used integer;
begin
  perform credit_lock();
  select * into p from profiles where id=p_user for update;
  if not found or p.status<>'active' or p.email_confirmed_at is null then return jsonb_build_object('allowed',false,'reason','inactive_member'); end if;
  if not exists(select 1 from credit_accounts where user_id=p_user) then return jsonb_build_object('allowed',false,'reason','credit_account_not_activated'); end if;
  if p_request is null or p_operation not in ('pdp_analyze','reference_analyze','redesign_transcribe','pdp_image','redesign_generate','redesign_edit','poster_image','sns_image','ad_export','cs_ask') or p_outputs is null or cardinality(p_outputs)>60 or exists(select 1 from unnest(p_outputs) u where u is null or u not in(1,2)) or length(trim(coalesce(p_resource,'')))=0 then raise exception 'invalid_credit_quote'; end if;
  select coalesce(sum(u),0)::integer into v_need from unnest(p_outputs) u;
  if v_need>max_reserve_units() then return jsonb_build_object('allowed',false,'reason','invalid_request'); end if;
  perform credit_ensure_paid_period(p_user); v_state:=credit_wallet_state(p_user);
  /*
    ★ **AI 멈춤**(설계 §3.2 의 2번, §3.3). 관리자도 예외가 없다 — 「시스템 전체」다.
    행이 없거나 값이 '1' 이 아니면 멈춘 것이 아니다. 스위치 화면은 C4 에서 붙는다.
    중복 검사보다 앞이다 — 같은 열쇠로 다시 와도 「멈췄다」를 말해야 한다.
  */
  if not v_no_ai and exists(select 1 from app_settings where key='ai_paused' and value='1') then return jsonb_build_object('allowed',false,'reason','ai_paused','usage',v_state); end if;
  if exists(select 1 from generation_events where user_id=p_user and request_id=p_request) then return jsonb_build_object('allowed',false,'reason','duplicate_request','usage',v_state); end if;
  /*
    ★ **크레딧이 없으면 AI 를 못 쓴다**(설계 §3.2 의 4번, D5·D6).

    `v_state->>'balance'`(available+reserved)는 안 쓴다 — `credit_wallet_state`
    의 `reserved` 합은 만료·회수된 덩어리의 `reserved_units` 도 그대로 더하므로,
    덩어리가 만료된 뒤 needs_review 등으로 안 풀린 잡힌 크레딧만 남아도 잔액이
    0 보다 커 보여 0크레딧 회원이 통과해 버린다. 대신 **살아 있는 덩어리**(회수
    안 됨 · 만료 전) 중 아직 다 쓰지 않은 것이 하나라도 있는지 직접 본다 —
    `granted_units>consumed_units` 는 그 덩어리에 남은 `available`·`reserved_units`
    를 합쳐 본 것과 같다(칸 불변식 `consumed_units+reserved_units<=granted_units`).
    `v_need>0` 인 작업도 같은 사유다 — 잔액 0 에서 「크레딧이 모자랍니다」와
    문구가 갈리지 않게.

    CS 도우미는 크레딧이 없어도 가입 후 통틀어 10번까지 묻는다. 세는 규칙은
    시간당 한도와 같고 `invalid_request`(모델을 부르기 전 본문 오류)만 더 뺀다.
    `cs_failed` 는 센다 — CS 라우트는 모든 예외를 이것으로 닫아 제공사 오류를
    가를 수 없고, 모델 값이 이미 나갔을 수 있다.
  */
  if not v_no_ai and not exists(select 1 from credit_grants where user_id=p_user and revoked_at is null and expires_at>now() and granted_units>consumed_units) then
    if p_operation='cs_ask' and v_need=0 then
      select count(*)::integer into v_cs_used from generation_events
        where user_id=p_user and operation='cs_ask'
          and coalesce(error_code,'') <> all (v_exempt_codes || array['invalid_request']);
      if v_cs_used>=10 then return jsonb_build_object('allowed',false,'reason','credits_required','usage',v_state); end if;
    else
      return jsonb_build_object('allowed',false,'reason','credits_required','usage',v_state);
    end if;
  end if;
  -- Holding credits and blocking the member are different decisions. A hold survives expiry and
  -- settlement review by design; the block must not, or an abandoned request locks the account
  -- until an administrator notices. Only a live, unreviewed request blocks the next one.
  if v_need>0 and exists(select 1 from generation_events where user_id=p_user and pricing_policy='image-v2' and status='reserved' and requested_units>0 and expires_at>now() and credit_phase is distinct from 'needs_review') then return jsonb_build_object('allowed',false,'reason','concurrent_limit','usage',v_state); end if;
  /*
    **시간당 한도는 작업 종류별로 센다.** 한도 값은 앱이 넣어 준다
    (`lib/membership/hourly-limit.ts`). 옛 경로와 같은 계약이라야 한다 — 정책
    스위치 하나로 회원이 다른 한도를 받으면 안 된다(202609200002).
    ★ cs_ask 를 더했다. 앱은 이미 CS_ASK_HOURLY_LIMIT 을 넘기고 있었는데 이
    목록에 없어 장부 경로에서는 걸리지 않았다(설계 §2).
  */
  if p_operation in ('pdp_analyze','reference_analyze','redesign_transcribe','cs_ask') then
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

-- 권한은 create or replace 가 지킨다. 읽는 사람을 위해 한 번 더 적는다(202609280003 과 같다).
revoke all on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) from public, anon, authenticated;
grant execute on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) to service_role;

-- ── 하나인지 센다(202609280003 부터의 규칙, sql-function-unique.test.ts) ──
do $$
declare v_몇 integer;
begin
  select count(*)::integer into v_몇
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'credit_reserve';
  if v_몇 <> 1 then
    raise exception 'credit_reserve 가 %개입니다. 하나여야 합니다 — 인자 목록이 어긋난 판이 생겼습니다(42725).', v_몇;
  end if;
  if to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)') is null then
    raise exception '정본 credit_reserve(uuid,uuid,text,integer[],text,integer) 가 없습니다.';
  end if;
  raise notice 'credit_reserve 는 하나이고 인자도 그대로입니다.';
end $$;

-- ── 확인 ─────────────────────────────────────────────────────────────
--
-- select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--  where n.nspname='public' and p.proname='credit_reserve';
--   → 한 줄. credit_reserve(uuid,uuid,text,integer[],text,integer)
-- select key, value from app_settings where key='ai_paused';
--   → 없거나 '0' 이어야 한다. '1' 이면 모든 AI 가 멈춰 있다.
