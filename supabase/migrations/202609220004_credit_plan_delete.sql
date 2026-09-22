-- 구독 플랜 삭제. 2026-09-22 사용자 결정(추천안):
--   쓰거나 썼던 회원이 없으면 진짜 지운다. 있으면 지우지 않고 몇 명인지 돌려준다.
--
-- 구독(user_subscriptions)과 결제 확인 기록(subscription_periods)이 플랜을 참조한다.
-- 그런 플랜을 지우면 그 회원의 구독·결제 기록이 깨진다 — 그때는 「판매 중지」를 쓴다.
--
-- 순서 제약 없음. 새 함수 하나만 더한다. 옛 코드는 이 함수를 부르지 않는다.
create or replace function public.credit_admin_plan_delete(p_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_members integer; v_plan subscription_plans%rowtype;
begin
  perform credit_lock(); perform credit_require_admin(p_actor);
  select * into v_plan from subscription_plans where id=p_id for update;
  if not found then raise exception 'credit_plan_not_found'; end if;
  select count(distinct user_id)::integer into v_members from (
    select user_id from user_subscriptions where plan_id=p_id
    union all select user_id from subscription_periods where plan_id=p_id) used;
  if v_members>0 then return jsonb_build_object('deleted',false,'members',v_members); end if;
  delete from subscription_plans where id=p_id;
  insert into credit_admin_events(id,actor_id,action,target_ids,reason,input)
    values(gen_random_uuid(),p_actor,'plan_delete',array[]::uuid[],'플랜 삭제',to_jsonb(v_plan));
  return jsonb_build_object('deleted',true,'members',0);
end $$;

revoke all on function public.credit_admin_plan_delete(text,uuid) from public,anon,authenticated;
grant execute on function public.credit_admin_plan_delete(text,uuid) to service_role;

-- 되돌리기: drop function if exists public.credit_admin_plan_delete(text,uuid);
