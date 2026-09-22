import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609220003 — 전 회원을 새 장부로 옮긴다(2026-09-22 사용자 결정).
  운영과 같은 순서로 시험한다: 옮기기 전 세상(0001·0002)에 회원·팀·옛 사용 기록을
  먼저 만들고, 그다음 003 을 운영자가 SQL 편집기에서 돌리듯 통째로 돌린다.
*/
const owner='30000000-0000-4000-8000-000000000001';
const second='30000000-0000-4000-8000-000000000002';
const member='30000000-0000-4000-8000-000000000003';
const waiting='30000000-0000-4000-8000-000000000004';
const team='40000000-0000-4000-8000-000000000001';
const legacyHold=randomUUID();
const activate=readFileSync(new URL('../../supabase/migrations/202609220003_credit_activate.sql',import.meta.url),'utf8');
let db;
const json=async q=>JSON.parse(await db.sql(q));
const reserve=(user,request,outputs,op='poster_image')=>json(`select credit_reserve_dispatch('${user}','${request}','${op}',1,10,array[${outputs.join(',')}]::integer[],'test');`);

before(async()=>{
  db=await testPostgres();
  await db.migrate([],{until:'202609220002'});
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${owner}','owner@example.invalid',now()),('${second}','second@example.invalid',now()),
      ('${member}','member@example.invalid',now()),('${waiting}','waiting@example.invalid',null);
    update profiles set status='active',monthly_quota=100 where id<>'${waiting}';
    update profiles set role='admin' where id in('${owner}','${second}');
    insert into teams(id,name,monthly_quota) values('${team}','Team',0);
    insert into team_members(user_id,team_id,role) values('${member}','${team}','leader');
    insert into generation_events(user_id,request_id,operation,period_start,requested_units,consumed_units,status,expires_at)
      values('${member}','${randomUUID()}','poster_image',credit_period_start(),5,5,'succeeded',now());`);
  // 옮기기 직전에 돌고 있던 옛 예약 하나. 옮긴 뒤에도 닫혀야 한다.
  await db.sql(`select reserve_generation_cost_v1('${member}','${legacyHold}','poster_image',2,10);`);
  await db.sql(activate);
});
after(async()=>{await db?.close();});

test('every existing profile gets an account and nobody is left on the old limit',async()=>{
  assert.equal(await db.sql(`select count(*) from profiles p where not exists(select 1 from credit_accounts a where a.user_id=p.id);`),'0');
  assert.equal(await db.sql(`select count(*) from credit_accounts;`),'4');
});
test('members start at zero and keep the old numbers only as a snapshot',async()=>{
  const wallet=await json(`select credit_summary('${member}');`);
  assert.equal(wallet.available,0);
  assert.equal(wallet.used,0,'old units must not reappear as credits used this month');
  assert.equal(wallet.unlimited,false);
  const snap=await json(`select legacy_snapshot from credit_accounts where user_id='${member}';`);
  assert.equal(snap.quota,100);assert.equal(snap.used,5);
});
test('a member with no credits is refused an image but may still analyse',async()=>{
  const image=await reserve(member,randomUUID(),[1]);
  assert.equal(image.allowed,false);assert.equal(image.reason,'quota_exceeded');
  const analysis=await reserve(member,randomUUID(),[],'pdp_analyze');
  assert.equal(analysis.allowed,true);
});
test('both administrators are unlimited and generate through the same ledger',async()=>{
  for (const admin of [owner,second]) {
    assert.equal((await json(`select credit_summary('${admin}');`)).unlimited,true);
    const request=randomUUID();
    const r=await reserve(admin,request,[2,1]);
    assert.equal(r.allowed,true);assert.equal(r.policy,'image-v2');
    const done=await json(`select credit_finalize_dispatch('${admin}','${request}',true,0,2,true,null);`);
    assert.equal(done.consumed_units,3);
  }
  assert.equal(await db.sql(`select count(*) from credit_grants where source_key like 'unlimited:%';`),'2');
});
test('running the migration again changes nothing',async()=>{
  const count=`select count(*)||'/'||(select count(*) from credit_accounts)||'/'||(select count(*) from credit_admin_events)||'/'||(select sum(granted_units) from credit_grants) from credit_grants;`;
  const first=await db.sql(count);
  await db.sql(activate);
  assert.equal(await db.sql(count),first);
});
test('a new signup is enrolled at zero with no welcome credit',async()=>{
  const fresh=randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${fresh}','fresh@example.invalid',now());`);
  const wallet=await json(`select credit_wallet_state('${fresh}');`);
  assert.ok(wallet,'the signup must have an account');
  assert.equal(wallet.available,0);assert.equal(wallet.unlimited,false);
  assert.equal(await db.sql(`select count(*) from credit_grants where user_id='${fresh}';`),'0');
});
test('the administrator can give and take back credits and plans for anyone',async()=>{
  const grant=await db.sql(`select credit_admin_grant('${member}','purchase',10,10000,null,'${randomUUID()}','test purchase','${owner}');`);
  assert.equal((await json(`select credit_summary('${member}');`)).available,10);
  await db.sql(`select credit_admin_revoke('${grant}','test revoke','${owner}');`);
  assert.equal((await json(`select credit_summary('${member}');`)).available,0);
  await db.sql(`select credit_admin_plan('basic','Basic',100,100000,true,'${owner}');
    select credit_admin_subscription_many(array['${member}'::uuid,'${waiting}'::uuid],'basic','active',now(),null,'${owner}','${randomUUID()}');`);
  assert.equal(await db.sql(`select count(*) from user_subscriptions where status='active';`),'2');
  await db.sql(`select credit_admin_subscription_many(array['${member}'::uuid,'${waiting}'::uuid],'basic','canceled',now(),now(),'${owner}','${randomUUID()}');`);
  assert.equal(await db.sql(`select count(*) from user_subscriptions where status='canceled';`),'2');
});
test('the member list shows who is unlimited',async()=>{
  const list=await json(`select credit_admin_members('${owner}','','',null,'',false,'created','desc',50,0,'',false);`);
  const by=Object.fromEntries(list.items.map(m=>[m.id,m.unlimited]));
  assert.equal(by[owner],true);assert.equal(by[second],true);
  assert.equal(by[member],false);assert.equal(by[waiting],false);
});
test('revoking the unlimited lot ends unlimited on the spot',async()=>{
  const lot=await db.sql(`select id from credit_grants where source_key='unlimited:${second}';`);
  await db.sql(`select credit_admin_revoke('${lot}','test','${owner}');`);
  const wallet=await json(`select credit_summary('${second}');`);
  assert.equal(wallet.unlimited,false);assert.equal(wallet.available,0);
  const list=await json(`select credit_admin_members('${owner}','','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(list.items.find(m=>m.id===second).unlimited,false);
});
test('existing and new teams run on the new ledger',async()=>{
  assert.equal(await db.sql(`select credit_policy from teams where id='${team}';`),'image-v2');
  // 한도부터 정하고 회원을 넣는 순서. 옛 기본값이면 여기서 team_credit_policy_mismatch 다.
  const next=randomUUID();
  await db.sql(`insert into teams(id,name,monthly_quota) values('${next}','Next',5);
    insert into team_members(user_id,team_id,role) values('${waiting}','${next}','leader');`);
  assert.equal(await db.sql(`select credit_policy from teams where id='${next}';`),'image-v2');
});
test('a reservation taken under the old limit still closes after the move',async()=>{
  const done=await json(`select credit_finalize_dispatch('${member}','${legacyHold}',true,2,null,true,null);`);
  assert.equal(done.policy,'cost-v1');
  assert.equal(await db.sql(`select status from generation_events where request_id='${legacyHold}';`),'succeeded');
});
test('the old entry point refuses moved accounts, which is why CREDIT_LEDGER must be on first',async()=>{
  const r=await json(`select to_jsonb(x) from reserve_generation('${member}','${randomUUID()}','poster_image',1,10) x;`);
  assert.equal(r.allowed,false);assert.equal(r.reason,'credit_ledger_required');
});
test('an administrator can still delete a member who has no money records',async()=>{
  // 독립 리뷰가 찾은 자리: 계정 행이 profiles 를 참조하면서 삭제 규칙이 없어, 전원을
  // 옮긴 순간 회원 삭제가 「Database error deleting user」로 막혔다.
  const gone=randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${gone}','gone@example.invalid',now());`);
  assert.equal(await db.sql(`select credit_member_has_records('${gone}');`),'f');
  await db.sql(`delete from auth.users where id='${gone}';`);
  assert.equal(await db.sql(`select count(*) from profiles where id='${gone}';`),'0');
  assert.equal(await db.sql(`select count(*) from credit_accounts where user_id='${gone}';`),'0');
});
test('a member with money records is flagged before the database refuses the delete',async()=>{
  const paid=randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${paid}','paid@example.invalid',now());
    select credit_admin_grant('${paid}','purchase',5,5000,null,'${randomUUID()}','paid','${owner}');`);
  assert.equal(await db.sql(`select credit_member_has_records('${paid}');`),'t');
  // 돈 기록은 회원과 함께 지우지 않는다. 화면이 먼저 「정지해 주세요」라고 말하는 이유다.
  await assert.rejects(db.sql(`delete from auth.users where id='${paid}';`),/foreign key/);
});
test('the team screen learns who is unlimited',async()=>{
  const shared=randomUUID();
  await db.sql(`insert into teams(id,name,monthly_quota) values('${shared}','Shared',0);
    insert into team_members(user_id,team_id,role) values('${owner}','${shared}','leader');`);
  const state=await json(`select credit_team_state('${shared}');`);
  assert.equal(state.members.find(m=>m.userId===owner).unlimited,true);
});
test('browser roles cannot call the new functions',async()=>{
  for (const fn of ['credit_enroll(uuid)','credit_is_unlimited(uuid)','credit_unlimited_source(uuid)','credit_enroll_new_profile()','credit_member_has_records(uuid)'])
    assert.equal(await db.sql(`select has_function_privilege('authenticated','public.${fn}','execute');`),'f',fn);
});
