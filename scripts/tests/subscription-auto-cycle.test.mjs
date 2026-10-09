import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610090001 — 월 구독 배정 = 크레딧 지급, 매달 자동 (2026-10-09 사용자 결정).

  1. 관리자가 배정하면 그 자리에서 플랜만큼 들어간다
  2. 구독이 켜져 있는 동안 배정일을 기준으로 매달 자동으로 다시 들어간다
  3. 구독 크레딧은 배정한 날부터 한 달 쓴다
  4. 다른 플랜으로 바꾸면 이전 플랜의 남은 크레딧은 거둬들이고 새 플랜 크레딧만 준다
*/
const admin='70000000-0000-4000-8000-000000000001';
const a='70000000-0000-4000-8000-000000000002';
let db;
const json=async q=>JSON.parse(await db.sql(q));
const assign=(user,plan,status='active')=>db.sql(
  `select credit_admin_subscription_many(array['${user}'::uuid],'${plan}','${status}',now(),${status==='canceled'?'now()':'null'},'${admin}','${randomUUID()}');`);
const wallet=user=>json(`select credit_summary('${user}');`);
/** 시계를 돌리는 대신 기록을 그만큼 과거로 민다. */
const ageBy=(user,interval)=>db.sql(`
  update user_subscriptions set started_at=started_at-interval '${interval}' where user_id='${user}';
  update subscription_periods set starts_at=starts_at-interval '${interval}',expires_at=expires_at-interval '${interval}' where user_id='${user}';
  update credit_grants set granted_at=granted_at-interval '${interval}',expires_at=expires_at-interval '${interval}' where user_id='${user}' and kind='subscription';`);

before(async()=>{
  db=await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now()),('${a}','a@example.invalid',now());
    update profiles set status='active',role=case when id='${admin}' then 'admin' else 'member' end;`);
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.sql(`truncate credit_jobs,credit_consumptions,credit_holds,generation_events,credit_grants,subscription_periods,user_subscriptions,subscription_plans,credit_admin_events cascade;
    select credit_admin_plan('basic','Basic',75,89000,true,'${admin}');
    select credit_admin_plan('premium','Premium',150,159000,true,'${admin}');`);
});

test('assigning a plan grants its credits at once, for one month from that moment',async()=>{
  await assign(a,'basic');
  const w=await wallet(a);
  assert.equal(w.subscription_units,75);
  const p=await json(`select row_to_json(x) from (select units,paid_amount_krw,confirmed_by,
      extract(epoch from (expires_at-starts_at))::bigint as secs,
      starts_at=(select started_at from user_subscriptions where user_id='${a}') as from_start,
      expires_at=((select started_at from user_subscriptions where user_id='${a}') at time zone 'Asia/Seoul' + interval '1 month') at time zone 'Asia/Seoul' as one_month
    from subscription_periods where user_id='${a}') x;`);
  assert.equal(p.units,75);assert.equal(p.paid_amount_krw,89000);assert.equal(p.confirmed_by,admin);
  assert.equal(p.from_start,true);assert.equal(p.one_month,true);
  assert.equal(await db.sql(`select assigned_by from user_subscriptions where user_id='${a}';`),admin);
});

test('pressing the same plan again does not grant again or move the renewal day',async()=>{
  await assign(a,'basic');
  const started=await db.sql(`select started_at from user_subscriptions where user_id='${a}';`);
  await assign(a,'basic');
  await wallet(a);await wallet(a);
  assert.equal((await wallet(a)).subscription_units,75);
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription';`),'1');
  assert.equal(await db.sql(`select started_at from user_subscriptions where user_id='${a}';`),started);
});

test('a month later the next cycle arrives by itself, once',async()=>{
  await assign(a,'basic');
  await ageBy(a,'1 month 1 day');
  const w=await wallet(a);await wallet(a);
  assert.equal(w.subscription_units,75,'the new cycle must be granted without a payment confirmation');
  assert.equal(await db.sql(`select count(*) from subscription_periods where user_id='${a}';`),'2');
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription' and expires_at>now();`),'1');
});

test('a member who stayed away for months gets only the current cycle',async()=>{
  await assign(a,'basic');
  await ageBy(a,'3 months 2 days');
  assert.equal((await wallet(a)).subscription_units,75);
  assert.equal(await db.sql(`select count(*) from subscription_periods where user_id='${a}';`),'2');
});

test('cycles count from the first day without drifting at month ends',async()=>{
  const at=(started,now)=>json(`select to_jsonb(c) from credit_subscription_cycle_bounds('${started}'::timestamptz,'${now}'::timestamptz) c;`);
  // 1월 31일 시작: 2/28 → 3/31 (2월에서 밀려 3/28 이 되지 않는다)
  let c=await at('2026-01-31 10:00+09','2026-03-05 00:00+09');
  assert.equal(c.cycle,1);
  assert.equal(new Date(c.starts_at).toISOString(),'2026-02-28T01:00:00.000Z');
  assert.equal(new Date(c.expires_at).toISOString(),'2026-03-31T01:00:00.000Z');
  c=await at('2026-01-31 10:00+09','2026-03-31 10:00+09');
  assert.equal(c.cycle,2);
  c=await at('2026-01-31 10:00+09','2026-01-31 10:00+09');
  assert.equal(c.cycle,0);
});

test('changing the plan takes back the unused old credits and grants only the new plan',async()=>{
  await assign(a,'basic');
  await db.sql(`update credit_grants set consumed_units=20 where user_id='${a}' and kind='subscription';`);
  await assign(a,'premium');
  const w=await wallet(a);
  assert.equal(w.subscription_units,150,'only the new plan remains usable');
  const old=await json(`select row_to_json(g) from (select consumed_units,revoked_at is not null as revoked,revoked_by from credit_grants where user_id='${a}' and granted_units=75) g;`);
  assert.equal(old.revoked,true);assert.equal(old.consumed_units,20,'what was already used stays used');assert.equal(old.revoked_by,admin);
  assert.equal(await db.sql(`select plan_id from user_subscriptions where user_id='${a}';`),'premium');
});

test('a plan change waits while a job is holding the old credits',async()=>{
  await assign(a,'basic');
  await json(`select credit_reserve('${a}','${randomUUID()}','poster_image',array[1,1],'poster:test');`);
  await assert.rejects(assign(a,'premium'),/credit_grant_has_holds/);
  assert.equal(await db.sql(`select plan_id from user_subscriptions where user_id='${a}';`),'basic');
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription';`),'1');
});

test('after canceling, the paid cycle stays usable and no new cycle comes',async()=>{
  await assign(a,'basic');
  await assign(a,'basic','canceled');
  assert.equal((await wallet(a)).subscription_units,75);
  await ageBy(a,'1 month 1 day');
  assert.equal((await wallet(a)).subscription_units,0);
  assert.equal(await db.sql(`select count(*) from subscription_periods where user_id='${a}';`),'1');
});

test('reactivating starts a fresh cycle and takes back the remainder of the old one',async()=>{
  await assign(a,'basic');
  await assign(a,'basic','suspended');
  await assign(a,'basic');
  assert.equal((await wallet(a)).subscription_units,75);
  assert.equal(await db.sql(`select count(*) from credit_grants where kind='subscription' and revoked_at is null;`),'1');
});

test('the manual monthly payment confirmation can no longer add credits',async()=>{
  await assign(a,'basic');
  await assert.rejects(
    db.sql(`select credit_admin_confirm_period('${a}',credit_period_start(),89000,75,'${randomUUID()}','${admin}');`),
    /subscription_auto_cycle/);
  assert.equal((await wallet(a)).subscription_units,75);
});

test('browser roles cannot call the new functions',async()=>{
  assert.equal(await db.sql(`select has_function_privilege('authenticated','public.credit_subscription_cycle(uuid)','execute');`),'f');
  assert.equal(await db.sql(`select has_function_privilege('anon','public.credit_subscription_cycle_bounds(timestamptz,timestamptz)','execute');`),'f');
});

// ── 독립 검토(2026-10-09) 뒤 더한 것 ────────────────────────────────
test('the app server clock running ahead does not delay or lose the first grant',async()=>{
  await db.sql(`select credit_admin_subscription('${a}','basic','active',now()+interval '5 seconds',null,'${admin}');`);
  assert.equal((await wallet(a)).subscription_units,75);
});

test('a plan change with the old start time still grants the new plan',async()=>{
  await assign(a,'basic');
  await db.sql(`select credit_admin_subscription('${a}','premium','active',(select started_at from user_subscriptions where user_id='${a}'),null,'${admin}');`);
  assert.equal((await wallet(a)).subscription_units,150);
});

test('a first assignment leaves subscription credits granted by hand alone',async()=>{
  await db.sql(`select credit_admin_grant('${a}','subscription',50,0,null,'manual-${randomUUID()}','hand grant','${admin}');`);
  await assign(a,'basic');
  assert.equal((await wallet(a)).subscription_units,125);
  assert.equal(await db.sql(`select count(*) from credit_grants where revoked_at is not null;`),'0');
});

test('a withdrawn or suspended member gets no new cycles',async()=>{
  await assign(a,'basic');
  try {
    await db.sql(`update profiles set status='withdrawn' where id='${a}';`);
    await ageBy(a,'1 month 1 day');
    await db.sql(`select credit_summary('${a}');`);
    assert.equal(await db.sql(`select count(*) from subscription_periods where user_id='${a}';`),'1');
  } finally { await db.sql(`update profiles set status='active' where id='${a}';`); }
});

test('a subscription saved before assigned_by existed starts cycling when the same plan is pressed',async()=>{
  await assign(a,'basic');
  await db.sql(`update user_subscriptions set assigned_by=null where user_id='${a}'; truncate credit_grants,subscription_periods cascade;`);
  await assign(a,'basic');
  assert.equal(await db.sql(`select assigned_by from user_subscriptions where user_id='${a}';`),admin);
  assert.equal((await wallet(a)).subscription_units,75);
});

test('no unique rule on member and calendar month is left behind',async()=>{
  assert.equal(await db.sql(`select count(*) from pg_constraint c where c.conrelid='public.subscription_periods'::regclass and c.contype='u'
    and (select array_agg(a.attname::text order by a.attname) from pg_attribute a where a.attrelid=c.conrelid and a.attnum=any(c.conkey))=array['period','user_id'];`),'0');
});
