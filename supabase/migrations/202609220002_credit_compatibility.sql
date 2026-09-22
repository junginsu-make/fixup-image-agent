-- Old deployments must not silently charge a migrated account in old units.
do $$ begin
  if to_regprocedure('public.reserve_generation_cost_v1(uuid,uuid,text,integer,integer)') is null then
    alter function public.reserve_generation(uuid,uuid,text,integer,integer) rename to reserve_generation_cost_v1;
  end if;
  if to_regprocedure('public.finalize_generation_cost_v1(uuid,uuid,boolean,integer,text)') is null then
    alter function public.finalize_generation(uuid,uuid,boolean,integer,text) rename to finalize_generation_cost_v1;
  end if;
end $$;

create or replace function public.reserve_generation(p_user_id uuid,p_request_id uuid,p_operation text,p_units integer,p_analysis_limit integer default 10)
returns table(allowed boolean,reason text,used_units integer,reserved_units integer,quota integer,current_period_start date,current_period_end date)
language plpgsql security definer set search_path=public as $$
declare s jsonb;
begin
  perform credit_lock();
  if exists(select 1 from credit_accounts where user_id=p_user_id) then
    s:=credit_wallet_state(p_user_id);
    return query select false,'credit_ledger_required'::text,(s->>'used')::integer,(s->>'reserved')::integer,(s->>'balance')::integer+(s->>'used')::integer,credit_period_start(),(credit_period_start()+interval '1 month')::date;
    return;
  end if;
  return query select * from reserve_generation_cost_v1(p_user_id,p_request_id,p_operation,p_units,p_analysis_limit);
end $$;

create or replace function public.finalize_generation(p_user_id uuid,p_request_id uuid,p_success boolean,p_consumed_units integer default 0,p_error_code text default null)
returns table(used_units integer,reserved_units integer,quota integer,current_period_start date,current_period_end date)
language plpgsql security definer set search_path=public as $$
begin
  perform credit_lock();
  if exists(select 1 from generation_events where user_id=p_user_id and request_id=p_request_id and pricing_policy='image-v2') then raise exception 'credit_ledger_required'; end if;
  return query select * from finalize_generation_cost_v1(p_user_id,p_request_id,p_success,p_consumed_units,p_error_code);
end $$;

create or replace function public.credit_reserve_dispatch(p_user uuid,p_request uuid,p_operation text,p_legacy_units integer,p_analysis_limit integer,p_outputs integer[],p_resource text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v record;
begin
  perform credit_lock();
  if exists(select 1 from credit_accounts where user_id=p_user) then
    if p_outputs is null then return jsonb_build_object('allowed',false,'reason','credit_quote_required','usage',credit_wallet_state(p_user)); end if;
    return credit_reserve(p_user,p_request,p_operation,p_outputs,p_resource,p_analysis_limit);
  end if;
  select * into v from reserve_generation_cost_v1(p_user,p_request,p_operation,p_legacy_units,p_analysis_limit);
  return jsonb_build_object('allowed',v.allowed,'reason',v.reason,'policy','cost-v1','usage',to_jsonb(v));
end $$;

create or replace function public.credit_finalize_dispatch(p_user uuid,p_request uuid,p_success boolean,p_legacy_units integer,p_delivered integer,p_terminal boolean,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e generation_events%rowtype; v record;
begin
  perform credit_lock();
  select * into e from generation_events where user_id=p_user and request_id=p_request for update;
  if not found then raise exception 'credit_reservation_not_found'; end if;
  if e.pricing_policy='image-v2' then
    if p_delivered is null or p_delivered<0 then
      if p_success and jsonb_array_length(e.credit_quote->'outputs')>0 then raise exception 'delivery_evidence_required'; end if;
      p_delivered:=0;
    end if;
    return credit_finalize(p_user,p_request,array(select generate_series(0,p_delivered-1)),p_terminal,p_error);
  end if;
  select * into v from finalize_generation_cost_v1(p_user,p_request,p_success,p_legacy_units,p_error);
  return jsonb_build_object('settled',true,'policy','cost-v1','usage',to_jsonb(v));
end $$;

-- A ledger-backed team excludes pre-conversion events but carries their explicit opening amount.
create or replace function public.team_units_used(p_team_id uuid,p_period_start date,p_exclude_user uuid)
returns integer language sql stable security definer set search_path=public as $$
 select coalesce(sum(value),0)::integer from (
   select case when e.status='succeeded' then e.consumed_units when e.status='reserved' and (e.pricing_policy='image-v2' or e.expires_at>now()) then e.requested_units else 0 end as value
   from generation_events e join teams t on t.id=e.team_id
   where e.team_id=p_team_id and e.period_start=p_period_start and e.user_id is distinct from p_exclude_user
     and e.pricing_policy=t.credit_policy
   union all
   select a.opening_used_units from credit_accounts a join team_members tm on tm.user_id=a.user_id
   where tm.team_id=p_team_id and a.opening_period=p_period_start and a.user_id is distinct from p_exclude_user
 ) values_to_sum;
$$;

-- Generation status and settlement links are server-owned. Reads remain under existing RLS.
revoke insert,update on public.poster_projects from authenticated;
revoke insert,update on public.sns_projects from authenticated;
grant insert,update on public.poster_projects,public.sns_projects to service_role;

revoke all on function public.reserve_generation(uuid,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.finalize_generation(uuid,uuid,boolean,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_generation(uuid,uuid,text,integer,integer) to service_role;
grant execute on function public.finalize_generation(uuid,uuid,boolean,integer,text) to service_role;
do $$ declare f regprocedure; begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'credit\_%' escape '\' or p.proname in('reserve_generation_cost_v1','finalize_generation_cost_v1')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f);
    execute format('grant execute on function %s to service_role',f);
  end loop;
end $$;

-- ── 되돌리기 ──────────────────────────────────────────────────────
--
-- 이 파일은 **함수 이름을 바꾼다**(`reserve_generation` → `..._cost_v1`).
-- 그래서 순서가 있다. 반대로 하면 둘 다 사라진다.
--
--   1. drop function public.reserve_generation(uuid,uuid,text,integer,integer);
--      drop function public.finalize_generation(uuid,uuid,boolean,integer,text);
--   2. alter function public.reserve_generation_cost_v1(uuid,uuid,text,integer,integer)
--        rename to reserve_generation;
--      alter function public.finalize_generation_cost_v1(uuid,uuid,boolean,integer,text)
--        rename to finalize_generation;
--   3. drop function if exists public.credit_reserve_dispatch(uuid,uuid,text,integer,integer,integer[],text);
--      drop function if exists public.credit_finalize_dispatch(uuid,uuid,boolean,integer,integer,boolean,text);
--   4. `team_units_used` 를 202609070005 판 정의로 되돌린다.
--   5. 프로젝트 쓰기 권한:
--        grant insert, update on public.poster_projects, public.sns_projects to authenticated;
--      **이건 정산 위조를 막으려고 회수한 것이다.** 되돌리면 회원이 자기
--      프로젝트의 `reservationId` 를 직접 바꿀 수 있다. 앱은 이미 admin
--      클라이언트로 쓰도록 바뀌었으므로(`lib/poster/supabase-store.ts`,
--      `lib/sns-flow-store.ts`), 앱을 함께 되돌리지 않는 한 필요 없다.
--
-- ⚠ 202609220001 의 「되돌리기」를 **먼저** 읽을 것. 전환한 회원이 있으면 옛
--    함수로 돌아가는 순간 그 회원들이 막힌다.
