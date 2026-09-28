-- ════════════════════════════════════════════════════════════════════
--  `credit_reserve` 를 하나로 되돌린다
--  (2026-09-28 운영 장애. 내가 만든 것이다)
--
--  ── 무엇이 있었나 ─────────────────────────────────────────────────
--
--  배포 직후 도우미에게 물으면 500 이 났다. 로그는 이랬다.
--
--    [usage] 예약 실패 {"cause":"rpc_error","operation":"cs_ask",
--      "error":{"code":"42725","message":"function credit_reserve(uuid,
--      uuid, text, integer[], text) is not unique"}}
--
--  42725 는 **모호한 함수 호출**이다. 같은 이름의 함수가 둘이고 둘 다 그
--  호출을 받을 수 있어서 PostgreSQL 이 고르기를 거부했다.
--
--  ── 왜 둘이 됐나 ──────────────────────────────────────────────────
--
--  `202609280001` 이 `create or replace function public.credit_reserve(
--  … , p_analysis_limit integer default 10)` 를 돌렸다. 저장소의 정본
--  (`202609220001`)이 그 모양이라 그대로 옮긴 것인데, **운영에는 그 인자가
--  없는 판이 돌고 있었다.**
--
--  `create or replace` 는 **같은 인자 목록일 때만 바꾼다.** 인자가 하나라도
--  다르면 바꾸는 것이 아니라 **새로 만든다.** 그래서 지우지도 않은 옛 판
--  옆에 새 판이 생겼고, 인자 다섯 개로 부르는 자리는 둘 다에 맞아 모호해졌다.
--
--  **그 전까지는 하나여서 잘 돌았다.** 도우미만의 문제가 아니라 장부를 쓰는
--  모든 예약이 같이 막혔다.
--
--  ── 무엇을 하나 ───────────────────────────────────────────────────
--
--  정본 하나만 남긴다. 정본은 인자 여섯 개짜리다(마지막은 기본값이 있어
--  다섯 개로 불러도 받는다) — 저장소가 그것을 정본으로 적고 있다.
--
--  **정본이 없으면 아무것도 지우지 않고 멈춘다.** 남은 것이 없어지면 예약이
--  통째로 죽는다.
--
--  ── 다시 겪지 않으려면 ────────────────────────────────────────────
--
--  이 파일 끝에 **이름마다 하나인지 세는 검사**를 둔다. 앞으로 이 함수들을
--  건드리는 마이그레이션은 같은 검사를 끝에 붙인다 — 저장소의 시험이 그것을
--  본다(`apps/web/lib/membership/__tests__/sql-function-unique.test.ts`).
--
--  여러 번 돌려도 안전하다.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. 정본이 있는지 먼저 본다 ────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)') is null then
    raise exception '정본 credit_reserve(uuid,uuid,text,integer[],text,integer) 가 없습니다. 202609220001 과 202609280001 을 먼저 적용하세요. 아무것도 지우지 않았습니다.';
  end if;
end $$;

-- ── 2. 정본이 아닌 판을 지운다 ────────────────────────────────────────
do $$
declare
  r record;
  v_정본 oid := to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)')::oid;
  v_지운수 integer := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'credit_reserve'
       and p.oid <> v_정본
  loop
    raise notice '정본이 아닌 판을 지웁니다: %', r.sig;
    execute format('drop function %s', r.sig);
    v_지운수 := v_지운수 + 1;
  end loop;

  if v_지운수 = 0 then
    raise notice 'credit_reserve 는 이미 하나입니다. 지운 것이 없습니다.';
  else
    raise notice 'credit_reserve 판 %개를 지웠습니다.', v_지운수;
  end if;
end $$;

-- ── 3. 권한을 다시 못 박는다 ──────────────────────────────────────────
--
--  옛 판을 지우면서 거기 달려 있던 권한도 같이 사라진다. 정본 쪽 권한은
--  그대로지만, 한 번 더 적어 두는 편이 나중에 읽기 쉽다.
revoke all on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) from public, anon, authenticated;
grant execute on function public.credit_reserve(uuid,uuid,text,integer[],text,integer) to service_role;

-- ── 4. 이름마다 하나인지 센다 ─────────────────────────────────────────
--
--  **이 검사가 이 파일의 핵심이다.** 위의 지우기는 한 번 쓰는 것이고, 이
--  검사는 앞으로 같은 실수를 그 자리에서 잡는다.
do $$
declare r record; v_몇 integer;
begin
  /*
    **고친 그것만 막고, 나머지는 알린다.**

    여기서 다른 이름 때문에 예외를 던지면 위의 고치기까지 함께 되돌아간다 —
    장애를 고치러 온 파일이 장애를 남기고 끝난다. 그래서 `credit_reserve` 만
    단단히 보고(위에서 방금 하나로 만들었으므로 여기서 실패할 수 없다),
    다른 이름은 **경고로 알린다.**
  */
  select count(*)::integer into v_몇
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'credit_reserve';
  if v_몇 <> 1 then
    raise exception 'credit_reserve 가 %개입니다. 하나여야 합니다.', v_몇;
  end if;

  for r in
    select p.proname as 이름, count(*)::integer as 수,
           string_agg(p.oid::regprocedure::text, ' / ' order by p.oid::regprocedure::text) as 목록
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('credit_finalize', 'credit_reserve_dispatch',
                         'credit_finalize_dispatch', 'reserve_generation', 'finalize_generation')
     group by p.proname
    having count(*) > 1
  loop
    raise warning '** 살펴볼 것 ** % 이 %개입니다. 인자 목록이 다른 판이 함께 있으면 부르는 자리가 모호해집니다(42725): %',
      r.이름, r.수, r.목록;
  end loop;

  raise notice 'credit_reserve 는 하나입니다. 위에 경고가 없으면 나머지도 하나입니다.';
end $$;

-- ── 확인 ─────────────────────────────────────────────────────────────
--
-- select p.oid::regprocedure from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname='public' and p.proname='credit_reserve';
--   → 한 줄. credit_reserve(uuid,uuid,text,integer[],text,integer)
