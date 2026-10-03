-- 옛 예약 함수(reserve_generation)로는 아무도 못 쓴다. 2026-10-03 사용자 결정:
--
--   > 상세페이지 크레딧을 비켜가면 안됩니다. 지금은 상용화 전이라 아무 사용자도 없다고
--   > 판단해도 됩니다.
--
-- ── 무엇이 새고 있었나 ────────────────────────────────────────────
--
-- 같은 DB 를 쓰는 **별도 상세페이지 제품**(detail-page-studio)이 이 함수를 부른다. 우리 앱은
-- CREDIT_LEDGER=1 이라 새 장부(credit_reserve_dispatch)로만 예약한다(2026-10-03 운영 확인).
--
-- 202609220002 가 이 함수 맨 앞에 「새 장부 계정이 있으면 credit_ledger_required 로 거절」을
-- 넣었다. 그런데 202609280001(CS 도우미 작업 추가)이 함수를 옛 판(202609210001)에서 통째로
-- 다시 쓰면서 그 줄이 사라졌다 — 크레딧 0 인 새 회원도 옛 월 한도(100장)로 「허용」됐다.
-- 2026-10-03 운영 확인: 그 줄 없음, 새 장부 계정 없는 회원 0, 9/28 뒤 옛 방식 사용 기록 없음.
--
-- ── 무엇을 바꾸나 ─────────────────────────────────────────────────
--
-- 계정이 있든 없든 **언제나 거절**한다. 모든 회원은 새 장부 계정이 있고(202609220003),
-- 새로 가입해도 바로 생긴다(트리거 credit_enroll_new_profile) — 옛 월 한도 길을 남길 까닭이 없다.
-- 그 결과 별도 상세페이지 제품은 이미지를 만들지 못한다(사용자 없음, 사용자 결정).
--
-- 이름·인자·돌려주는 모양은 그대로다(42725 사고 방지, 권한도 그대로 — service_role 만).
-- 정산 함수 finalize_generation 은 건드리지 않는다(202609220002 의 막기가 그대로 있다).
--
-- ⚠ 언제 돌리나: 아무 때나 된다. 우리 앱은 이 함수를 부르지 않는다. 여러 번 돌려도 같다.
--
-- ⚠ 이 함수를 다시 정의하는 파일을 새로 만들 때는 **이 거절을 지우지 않는다.** 202609280001 이
-- 바로 그렇게 새는 길을 다시 열었다. scripts/tests/reserve-generation-ledger-only.test.mjs 가
-- 마이그레이션을 전부 깔고 확인한다.

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
language sql
stable
security definer
set search_path = public
as $$
  select false, 'credit_ledger_required'::text, 0, 0, 0,
         credit_period_start(), (credit_period_start() + interval '1 month')::date;
$$;

-- 하나인지 세고 끝낸다(202609280003 부터의 규칙 — 인자 목록이 어긋난 판이 옆에 생기면 42725).
do $$
declare v_몇 integer;
begin
  select count(*)::integer into v_몇
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'reserve_generation';
  if v_몇 <> 1 then
    raise exception 'reserve_generation 이 %개입니다. 하나여야 합니다 — 인자 목록이 어긋난 판이 생겼습니다(42725).', v_몇;
  end if;
  if to_regprocedure('public.reserve_generation(uuid,uuid,text,integer,integer)') is null then
    raise exception '정본 reserve_generation(uuid,uuid,text,integer,integer) 가 없습니다.';
  end if;
  raise notice 'reserve_generation 은 하나이고 언제나 거절합니다.';
end $$;

-- ── 확인 ──────────────────────────────────────────────────────────
--
--   select position('credit_ledger_required' in pg_get_functiondef(
--            'public.reserve_generation(uuid,uuid,text,integer,integer)'::regprocedure)) > 0;
--   -- true 여야 한다.
--
--   select has_function_privilege('authenticated', 'public.reserve_generation(uuid,uuid,text,integer,integer)', 'execute');
--   -- false 여야 한다(회원은 원래 못 부른다 — 바뀌지 않았는지).
--
-- ── 되돌리기 ──────────────────────────────────────────────────────
--
--   202609280001_cs_ask_operation.sql 의 reserve_generation 정의를 다시 실행한다
--   (그러면 위의 새는 길이 다시 열린다 — 별도 상세페이지 제품을 다시 쓸 때만).
