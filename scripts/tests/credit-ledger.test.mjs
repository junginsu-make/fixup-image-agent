import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

const admin='10000000-0000-4000-8000-000000000001';
const a='10000000-0000-4000-8000-000000000002';
const b='10000000-0000-4000-8000-000000000003';
const team='20000000-0000-4000-8000-000000000001';
let db;
const json=async q=>JSON.parse(await db.sql(q));
before(async()=>{
  db=await testPostgres();
  await db.migrate(['202609220001_credit_ledger_v2.sql','202609220002_credit_compatibility.sql']);
  if (process.env.CREDIT_TEST_MUTATION) {
    const source=readFileSync(new URL('../../supabase/migrations/202609220001_credit_ledger_v2.sql',import.meta.url),'utf8');
    const target=process.env.CREDIT_TEST_MUTATION==='blocking'?'credit_reserve':'credit_finalize';
    let fn=source.match(new RegExp(String.raw`create or replace function public\.${target}\([\s\S]+?end \$\$;`))[0];
    if(process.env.CREDIT_TEST_MUTATION==='duplicate') fn=fn.replace(/  if e\.status<>'reserved' then return[^\n]+\n/,'');
    else if(process.env.CREDIT_TEST_MUTATION==='expiry') fn=fn.replace('where ch.user_id=p_user and ch.request_id=p_request','where ch.user_id=p_user and ch.request_id=p_request and cg.expires_at>now()');
    // Put the block back the way it was: any reserved row blocks, however stale, however reviewed.
    else if(process.env.CREDIT_TEST_MUTATION==='blocking') fn=fn.replace(" and expires_at>now() and credit_phase is distinct from 'needs_review'",'');
    else throw new Error('Unknown isolated test mutation');
    await db.sql(fn);
  }
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values ('${admin}','admin@example.invalid',now()),('${a}','a@example.invalid',now()),('${b}','b@example.invalid',now());
    update profiles set status='active',role=case when id='${admin}' then 'admin' else 'member' end,monthly_quota=100;
    select credit_admin_activate(array['${a}'::uuid,'${b}'::uuid],1,'test conversion','${admin}','${randomUUID()}',true);`);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.sql(`truncate credit_jobs,credit_consumptions,credit_holds,generation_events,credit_grants,subscription_periods,user_subscriptions,subscription_plans,credit_admin_events cascade;
    delete from team_members; delete from teams;
    select credit_admin_grant('${a}','bonus',100,0,now()+interval '3 months','a-${randomUUID()}','fixture','${admin}');
    select credit_admin_grant('${b}','bonus',100,0,now()+interval '3 months','b-${randomUUID()}','fixture','${admin}');`);
});
const reserve=(user,id,units=1)=>json(`select credit_reserve('${user}','${id}','poster_image',array[${Array(units).fill(1).join(',')}],'poster:test');`);

test('grant retries preserve one source and reject different amounts',async()=>{
  const source=randomUUID();
  const first=await db.sql(`select credit_admin_grant('${a}','purchase',10,10000,null,'${source}','paid','${admin}');`);
  const second=await db.sql(`select credit_admin_grant('${a}','purchase',10,10000,null,'${source}','paid','${admin}');`);
  assert.equal(first,second);
  assert.equal((await json(`select credit_summary('${a}')`)).available,110);
  await assert.rejects(db.sql(`select credit_admin_grant('${a}','purchase',11,10000,null,'${source}','paid','${admin}');`),/credit_source_conflict/);
});
test('an active subscription without a paid period never grants credits',async()=>{
  await db.sql(`select credit_admin_plan('basic','Basic',100,100000,true,'${admin}');
    select credit_admin_subscription('${a}','basic','active',now(),null,'${admin}');`);
  await db.sql(`select credit_summary('${a}');`);
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription';`),'0');
  await db.sql(`select credit_admin_confirm_period('${a}',credit_period_start(),100000,100,'${randomUUID()}','${admin}');`);
  assert.equal((await json(`select credit_summary('${a}')`)).subscription_units,100);
  await db.sql(`select credit_summary('${a}'); select credit_summary('${a}');`);
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription';`),'1');
});
test('expired lots protect held credits, then the unused portion expires',async()=>{
  const request=randomUUID();await reserve(a,request,10);
  await db.sql(`update credit_grants set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='${a}';`);
  const pending=await json(`select credit_summary('${a}');`);
  assert.equal(pending.available,0);assert.equal(pending.reserved,10);
  const done=await json(`select credit_finalize('${a}','${request}',array[0,1,2],true,null);`);
  assert.equal(done.consumed_units,3);assert.equal(done.usage.available,0);assert.equal(done.usage.reserved,0);
  assert.equal(await db.sql(`select sum(units) from credit_consumptions where user_id='${a}';`),'3');
});
test('duplicate finalization returns its first result without charging again',async()=>{
  const request=randomUUID();await reserve(a,request,3);
  const first=await json(`select credit_finalize('${a}','${request}',array[0,1],true,null);`);
  const again=await json(`select credit_finalize('${a}','${request}',array[0,1,2],true,null);`);
  assert.equal(first.consumed_units,2);assert.equal(again.consumed_units,2);
  assert.equal(again.usage.available,98);
});
test('uncertain failures retain a durable hold, not a ten-minute free release',async()=>{
  const request=randomUUID();await reserve(a,request,3);
  await db.sql(`select credit_mark_started('${a}','${request}');update generation_events set expires_at=now()-interval '1 hour' where request_id='${request}';`);
  const pending=await json(`select credit_finalize('${a}','${request}',array[]::integer[],false,'network_unknown');`);
  assert.equal(pending.settled,false);assert.equal(pending.usage.reserved,3);
  // Holding the money is not the same decision as blocking the member.
  const next=await reserve(a,randomUUID());
  assert.equal(next.allowed,true);
  assert.equal(next.usage.reserved,4);
  const done=await json(`select credit_admin_resolve('${a}','${request}',array[]::integer[],'provider confirmed no output','${admin}','${randomUUID()}');`);
  assert.equal(done.usage.reserved,1);
  assert.equal(done.usage.available,99);
});
test('an abandoned reservation keeps its credits but stops blocking once its window passes',async()=>{
  const stuck=randomUUID();await reserve(a,stuck,3);
  await db.sql(`select credit_mark_started('${a}','${stuck}');`);
  assert.equal((await reserve(a,randomUUID())).reason,'concurrent_limit');
  await db.sql(`update generation_events set expires_at=now()-interval '1 hour' where request_id='${stuck}';`);
  const next=await reserve(a,randomUUID());
  assert.equal(next.allowed,true,'abandoned_reservation_must_not_block');
  assert.equal(next.usage.reserved,4);
});
test('revocation cannot invalidate a pending reservation',async()=>{
  const request=randomUUID();await reserve(a,request,10);
  const grant=await db.sql(`select grant_id from credit_holds where request_id='${request}';`);
  await assert.rejects(db.sql(`select credit_admin_revoke('${grant}','revoke','${admin}');`),/credit_grant_has_holds/);
});
test('concurrent teammates cannot spend the same shared budget',async()=>{
  await db.sql(`insert into teams(id,name,monthly_quota,credit_policy) values('${team}','Team',5,'image-v2');
    insert into team_members(user_id,team_id,role) values('${a}','${team}','member'),('${b}','${team}','member');`);
  const first=db.sql(`begin;select credit_reserve('${a}','${randomUUID()}','poster_image',array[1,1,1,1],'a');select pg_sleep(.3);commit;`);
  await new Promise(r=>setTimeout(r,60));
  const second=reserve(b,randomUUID(),4);
  await Promise.all([first,second]);
  assert.equal(await db.sql(`select sum(requested_units) from generation_events where status='reserved';`),'4');
});
test('job binding is immutable and scoped to the authenticated owner',async()=>{
  const request=randomUUID();await reserve(a,request,1);
  await db.sql(`select credit_bind_job('${a}','${request}','poster:job','poster:test','provider-id','endpoint');`);
  await assert.rejects(db.sql(`select credit_bind_job('${a}','${request}','poster:job','poster:test','other-id','endpoint');`),/credit_job_binding_conflict/);
  assert.equal(await db.sql(`select credit_lookup_job('${b}','poster:job') is null;`),'t');
});
test('members cannot call credit RPCs or alter grants',async()=>{
  await assert.rejects(db.sql(`begin;set local role authenticated;select credit_summary('${a}');rollback;`),/permission denied/);
  assert.equal(await db.sql(`select has_table_privilege('authenticated','credit_grants','UPDATE');`),'f');
  await assert.rejects(db.sql(`select credit_admin_grant('${a}','bonus',1,0,now()+interval '1 day','x','bad actor','${b}');`),/credit_admin_required/);
});

test('legacy dispatch preserves old units and old callers cannot debit a migrated account',async()=>{
  const legacy=randomUUID(), modern=randomUUID();
  const old=await json(`select credit_reserve_dispatch('${admin}','${legacy}','poster_image',5,10,array[1],'test');`);
  assert.equal(old.allowed,true);assert.equal(old.policy,'cost-v1');
  const closed=await json(`select credit_finalize_dispatch('${admin}','${legacy}',true,5,1,true,null);`);
  assert.equal(closed.usage.used_units,5);
  assert.equal(await db.sql(`select reason from reserve_generation('${a}','${modern}','poster_image',5,10);`),'credit_ledger_required');
  const opened=await json(`select credit_reserve_dispatch('${a}','${modern}','poster_image',5,10,array[1],'test');`);
  assert.equal(opened.usage.reserved,1);
  const done=await json(`select credit_finalize_dispatch('${a}','${modern}',true,5,1,true,null);`);
  assert.equal(done.consumed_units,1);assert.equal(done.usage.available,99);
});
test('a migrated account requires a server quote; print images charge two and analyses zero',async()=>{
  assert.equal((await json(`select credit_reserve_dispatch('${a}','${randomUUID()}','poster_image',5,10,null,'test');`)).reason,'credit_quote_required');
  const request=randomUUID();
  await json(`select credit_reserve_dispatch('${a}','${request}','poster_image',20,10,array[2,2],'test');`);
  const result=await json(`select credit_finalize_dispatch('${a}','${request}',true,20,1,true,null);`);
  assert.equal(result.consumed_units,2);
  const free=randomUUID();await db.sql(`select credit_reserve_dispatch('${a}','${free}','pdp_analyze',0,10,array[]::integer[],'test');`);
  assert.equal((await json(`select credit_finalize_dispatch('${a}','${free}',true,0,null,true,null);`)).consumed_units,0);
});
test('bulk grants are atomic, idempotent and actor audited',async()=>{
  const source=randomUUID(), missing=randomUUID();
  await assert.rejects(db.sql(`select credit_admin_grant_many(array['${a}'::uuid,'${missing}'::uuid],'purchase',10,1000,null,'${source}','bulk','${admin}');`));
  assert.equal((await json(`select credit_summary('${a}')`)).available,100);
  for(let i=0;i<2;i++) await db.sql(`select credit_admin_grant_many(array['${a}'::uuid,'${b}'::uuid],'purchase',10,1000,null,'${source}','bulk','${admin}');`);
  assert.equal((await json(`select credit_summary('${a}')`)).available,110);
  assert.equal(await db.sql(`select count(*) from credit_admin_events where actor_id='${admin}' and action='grant';`),'4');
});
test('member filters and balance order apply globally before paging',async()=>{
  await db.sql(`select credit_admin_grant('${b}','bonus',20,0,now()+interval '1 day','${randomUUID()}','sort','${admin}');`);
  const page=await json(`select credit_admin_members(p_actor=>'${admin}',p_query=>'@example.invalid',p_sort=>'balance',p_direction=>'desc',p_limit=>1);`);
  assert.equal(page.total,3);assert.equal(page.items[0].id,b);
  const expiring=await json(`select credit_admin_members(p_actor=>'${admin}',p_expiring=>true);`);
  assert.equal(expiring.total,1);assert.equal(expiring.items[0].id,b);
  const history=await json(`select credit_admin_history('${admin}','${b}');`);
  assert.equal(history.grants.length,2);
});
test('concurrent finalization of the same request consumes exactly once',async()=>{
  const request=randomUUID();await reserve(a,request,2);
  const q=`select credit_finalize('${a}','${request}',array[0,1],true,null);`;
  await Promise.all([db.sql(q),db.sql(q),db.sql(q)]);
  assert.equal(await db.sql(`select sum(units) from credit_consumptions where request_id='${request}';`),'2');
  assert.equal((await json(`select credit_summary('${a}')`)).available,98);
});
test('project generation pointers cannot be changed through authenticated SQL',async()=>{
  for(const table of ['poster_projects','sns_projects']) {
    assert.equal(await db.sql(`select has_table_privilege('authenticated','${table}','UPDATE');`),'f');
    assert.equal(await db.sql(`select has_table_privilege('service_role','${table}','UPDATE');`),'t');
  }
});

test('team summaries use wallet balances and reject mixed policy members',async()=>{
  await db.sql(`insert into teams(id,name,monthly_quota,credit_policy) values('${team}','Team',5,'image-v2');insert into team_members(user_id,team_id,role) values('${a}','${team}','member');`);
  await reserve(a,randomUUID(),2);
  const state=await json(`select credit_team_state('${team}');`);
  assert.equal(state.teamUsed,2);assert.equal(state.members[0].personalQuota-state.members[0].used,98);
  await assert.rejects(db.sql(`insert into team_members(user_id,team_id,role) values('${admin}','${team}','member');`),/team_credit_policy_mismatch/);
});

test('late poster polls cannot clear a newer reservation or replace project data',async()=>{
  const project=randomUUID(), old=randomUUID(), current=randomUUID();
  await db.sql(`insert into poster_projects(id,user_id,title,ratio,model_id,status,data) values('${project}','${a}','Test','1:1','gpt-image-2','generating',jsonb_build_object('reservationId','${current}','note','keep'));
    select credit_reserve('${a}','${old}','poster_image',array[1],'poster:${project}');
    select credit_bind_job('${a}','${old}','poster:${old}','poster:${project}','provider','endpoint');`);
  assert.equal(await db.sql(`select credit_close_poster('${a}','${project}','${old}','done',true);`),'f');
  assert.equal(await db.sql(`select data->>'reservationId' from poster_projects where id='${project}';`),current);
  await db.sql(`update poster_projects set data=jsonb_set(data,'{reservationId}',to_jsonb('${old}'::text)) where id='${project}';`);
  assert.equal(await db.sql(`select credit_close_poster('${a}','${project}','${old}','done',true);`),'t');
  const row=await json(`select data from poster_projects where id='${project}';`);
  assert.equal(row.note,'keep');assert.equal(row.reservationId,undefined);
});
test('canceling a disabled plan preserves its already paid period',async()=>{
  await db.sql(`select credit_admin_plan('basic','Basic',100,100000,true,'${admin}');
    select credit_admin_subscription('${a}','basic','active',now(),null,'${admin}');
    select credit_admin_confirm_period('${a}',credit_period_start(),100000,100,'${randomUUID()}','${admin}');
    select credit_admin_plan('basic','Basic',100,100000,false,'${admin}');
    select credit_admin_subscription('${a}','basic','canceled',now(),now(),'${admin}');`);
  assert.equal((await json(`select credit_summary('${a}')`)).subscription_units,100);
  await assert.rejects(db.sql(`select credit_admin_confirm_period('${a}',(credit_period_start()+interval '1 month')::date,100000,100,'${randomUUID()}','${admin}');`),/active_subscription_required/);
});

test('a reservation settled before provider submission cannot start generating',async()=>{
  const request=randomUUID();await reserve(a,request,2);
  await db.sql(`select credit_admin_resolve('${a}','${request}',array[]::integer[],'confirmed before submission','${admin}','${randomUUID()}');`);
  await assert.rejects(db.sql(`select credit_mark_started('${a}','${request}');`),/credit_reservation_not_startable/);
  assert.equal((await json(`select credit_summary('${a}')`)).available,100);
});

test('a ledger reservation can enter provider submission only once while legacy remains compatible',async()=>{
  const request=randomUUID();await reserve(a,request,1);
  await db.sql(`select credit_mark_started('${a}','${request}');`);
  await assert.rejects(db.sql(`select credit_mark_started('${a}','${request}');`),/credit_reservation_not_startable/);
  const legacy=randomUUID();
  await db.sql(`select credit_reserve_dispatch('${admin}','${legacy}','poster_image',5,10,array[1],'test');select credit_mark_started('${admin}','${legacy}');`);
  assert.equal(await db.sql(`select status from generation_events where request_id='${legacy}';`),'reserved');
});
test('converting a team records the limit it replaced',async()=>{
  const c='10000000-0000-4000-8000-000000000004', t='20000000-0000-4000-8000-000000000002', action=randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${c}','c@example.invalid',now());
    update profiles set status='active',monthly_quota=100 where id='${c}';
    insert into teams(id,name,monthly_quota) values('${t}','Convert',103);
    insert into team_members(user_id,team_id,role) values('${c}','${t}','leader');
    select credit_admin_activate(array['${c}'::uuid],5,'team conversion','${admin}','${action}',true);`);
  assert.equal(await db.sql(`select monthly_quota from teams where id='${t}';`),'20');
  const audit=await json(`select result from credit_admin_events where id='${action}';`);
  const record=audit.find(row=>row.team_id===t);
  assert.ok(record,'the audit trail must keep the limit the conversion replaced');
  assert.equal(record.legacy_quota,103);
  assert.equal(record.quota,20);
});
test('rolling back to the old functions charges new-unit spending against the old limit',async()=>{
  const request=randomUUID();await reserve(a,request,3);
  await json(`select credit_finalize('${a}','${request}',array[0,1,2],true,null);`);
  // The old aggregate has no policy filter, so v2 consumption reads as v1 usage after a rollback.
  assert.equal(await db.sql(`select coalesce(sum(consumed_units),0) from generation_events
    where user_id='${a}' and period_start=credit_period_start() and status='succeeded';`),'3');
  await db.sql(`update profiles set monthly_quota=3 where id='${a}';`);
  const blocked=await json(`select to_jsonb(r) from reserve_generation_cost_v1('${a}','${randomUUID()}','pdp_image',1,10) r;`);
  await db.sql(`update profiles set monthly_quota=100 where id='${a}';`);
  assert.equal(blocked.allowed,false);
  assert.equal(blocked.reason,'quota_exceeded');
});
test('a conversion batch stays small enough not to freeze everyone else',async()=>{
  // The whole loop runs inside one transaction holding the global credit lock, so the batch size
  // is the length of a service-wide pause. Refuse a batch before it becomes one.
  const many=Array.from({length:51},()=>`'${randomUUID()}'::uuid`).join(',');
  await assert.rejects(
    db.sql(`select credit_admin_activate(array[${many}],1,'too many at once','${admin}','${randomUUID()}',true);`),
    /invalid_credit_conversion/);
});
test('wallet reads and audit lookups have an index to stand on',async()=>{
  // credit_wallet_state reads every lot of a member, revoked ones included, so the partial
  // live index cannot serve it. The audit table grows with operator actions, not member count.
  const defs=await db.sql(`select coalesce(string_agg(indexdef,' | ' order by indexname),'')
    from pg_indexes where schemaname='public' and tablename in('credit_grants','credit_admin_events');`);
  assert.match(defs,/ON public\.credit_grants USING btree \(user_id, expires_at\)/);
  assert.match(defs,/ON public\.credit_admin_events USING gin \(target_ids\)/);
});
test('a plan is assigned to a whole selection or to nobody',async()=>{
  await db.sql(`select credit_admin_plan('basic','Basic',100,100000,true,'${admin}');`);
  await db.sql(`select credit_admin_subscription_many(array['${a}'::uuid,'${b}'::uuid],'basic','active',now(),null,'${admin}','${randomUUID()}');`);
  assert.equal(await db.sql(`select count(*) from user_subscriptions where plan_id='basic' and status='active';`),'2');
  // One unconvertible member rolls the whole selection back rather than half-applying it.
  await db.sql(`delete from user_subscriptions;`);
  await assert.rejects(
    db.sql(`select credit_admin_subscription_many(array['${a}'::uuid,'${admin}'::uuid],'basic','active',now(),null,'${admin}','${randomUUID()}');`),
    /credit_account_not_activated/);
  assert.equal(await db.sql(`select count(*) from user_subscriptions;`),'0');
});
test('bulk status changes follow the same transitions as the single one',async()=>{
  await db.sql(`update profiles set status='active' where id in('${a}','${b}');`);
  const first=await json(`select credit_admin_member_status(array['${a}'::uuid,'${b}'::uuid],'suspended','abuse report','${admin}','${randomUUID()}');`);
  assert.equal(first.length,2);
  assert.equal(await db.sql(`select count(*) from profiles where id in('${a}','${b}') and status='suspended';`),'2');
  await assert.rejects(
    db.sql(`select credit_admin_member_status(array['${admin}'::uuid],'suspended','oops','${admin}','${randomUUID()}');`),
    /cannot_suspend_self/);
  const back=await json(`select credit_admin_member_status(array['${a}'::uuid,'${b}'::uuid],'active','restored','${admin}','${randomUUID()}');`);
  assert.equal(back.length,2);
  assert.equal(await db.sql(`select count(*) from profiles where id in('${a}','${b}') and status='active';`),'2');
});
test('the internal pricing contract is not readable from a member browser',async()=>{
  const cols=(await db.sql(`select coalesce(string_agg(distinct column_name,',' order by column_name),'')
    from information_schema.column_privileges where table_schema='public' and table_name='generation_events'
      and grantee='authenticated' and privilege_type='SELECT';`)).split(',');
  for (const hidden of ['credit_quote','credit_phase','pricing_policy'])
    assert.ok(!cols.includes(hidden),`${hidden} is still readable by members`);
  // A member must still read their own usage; closing the new columns cannot close the old ones.
  for (const shown of ['consumed_units','requested_units','status','operation'])
    assert.ok(cols.includes(shown),`${shown} stopped being readable`);
});
test('credits held for review are still unspendable',async()=>{
  const stuck=randomUUID();await reserve(a,stuck,3);
  await db.sql(`select credit_mark_started('${a}','${stuck}');`);
  await json(`select credit_finalize('${a}','${stuck}',array[]::integer[],false,'network_unknown');`);
  await db.sql(`update credit_grants set granted_units=5 where user_id='${a}';`);
  const state=await json(`select credit_summary('${a}');`);
  assert.equal(state.available,2);assert.equal(state.reserved,3);
  // Unblocking the member is not the same as releasing the money: the held 3 stay out of reach.
  const over=await reserve(a,randomUUID(),3);
  assert.equal(over.allowed,false);assert.equal(over.reason,'quota_exceeded');
  const fits=await reserve(a,randomUUID(),2);
  assert.equal(fits.allowed,true);
});
test('a member history lookup can actually reach the audit index',async()=>{
  // `scalar = any(array column)` cannot use GIN. Only the containment operator can, so an index that
  // exists is not the same as an index that is used -- the earlier test only proved the former.
  const def=await db.sql(`select pg_get_functiondef('public.credit_admin_history(uuid,uuid,integer)'::regprocedure);`);
  assert.match(def,/target_ids @> array\[/);
  const plan=await db.sql(`set enable_seqscan=off;
    explain select 1 from credit_admin_events where target_ids @> array['${a}'::uuid];`);
  assert.match(plan,/Index Scan/);
});
test('bulk approval records who approved and when',async()=>{
  await db.sql(`update profiles set status='pending',approved_at=null,approved_by=null where id='${b}';`);
  await json(`select credit_admin_member_status(array['${b}'::uuid],'active','bulk approve','${admin}','${randomUUID()}');`);
  const row=await db.sql(`select status||'|'||coalesce(approved_by::text,'-')||'|'||case when approved_at is null then '-' else 'set' end
    from profiles where id='${b}';`);
  await db.sql(`update profiles set status='active' where id='${b}';`);
  assert.equal(row,`active|${admin}|set`);
});
test('the member list can find who is waiting on a settlement review',async()=>{
  const stuck=randomUUID();await reserve(a,stuck,3);
  await db.sql(`select credit_mark_started('${a}','${stuck}');`);
  await json(`select credit_finalize('${a}','${stuck}',array[]::integer[],false,'network_unknown');`);
  const all=await json(`select credit_admin_members('${admin}','','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(all.items.find(m=>m.id===a).review_units,3);
  const only=await json(`select credit_admin_members('${admin}','','',null,'',false,'created','desc',50,0,'',true);`);
  assert.equal(only.items.length,1);
  assert.equal(only.items[0].id,a);
});
test('assigning a plan twice under one action does it once',async()=>{
  await db.sql(`select credit_admin_plan('basic','Basic',100,100000,true,'${admin}');`);
  const act=randomUUID();
  await db.sql(`select credit_admin_subscription_many(array['${a}'::uuid],'basic','active',now(),null,'${admin}','${act}');`);
  await db.sql(`select credit_admin_subscription_many(array['${a}'::uuid],'basic','active',now(),null,'${admin}','${act}');`);
  assert.equal(await db.sql(`select count(*) from credit_admin_events where action='subscription';`),'1');
});
