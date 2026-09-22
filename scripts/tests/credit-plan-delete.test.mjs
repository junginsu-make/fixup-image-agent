import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609220004 — 구독 플랜 삭제(2026-09-22 사용자 결정: 추천안).
  쓰거나 썼던 회원이 없으면 진짜 지우고, 있으면 지우지 않고 몇 명인지 알려 준다.
  구독 기록이 플랜을 참조하므로 지우면 그 회원의 구독·결제 기록이 깨진다.
*/
const admin='50000000-0000-4000-8000-000000000001';
const member='50000000-0000-4000-8000-000000000002';
let db;
const json=async q=>JSON.parse(await db.sql(q));

before(async()=>{
  db=await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now()),('${member}','member@example.invalid',now());
    update profiles set status='active',role=case when id='${admin}' then 'admin' else 'member' end;`);
});
after(async()=>{await db?.close();});

test('an unused plan is deleted and the deletion is audited',async()=>{
  await db.sql(`select credit_admin_plan('spare','Spare',10,1000,true,'${admin}');`);
  const r=await json(`select credit_admin_plan_delete('spare','${admin}');`);
  assert.equal(r.deleted,true);
  assert.equal(await db.sql(`select count(*) from subscription_plans where id='spare';`),'0');
  assert.equal(await db.sql(`select count(*) from credit_admin_events where action='plan_delete';`),'1');
});
test('a plan someone subscribed to is kept and the caller learns how many',async()=>{
  await db.sql(`select credit_admin_plan('basic','Basic',75,90000,true,'${admin}');
    select credit_admin_subscription_many(array['${member}'::uuid],'basic','canceled',now(),now(),'${admin}','${randomUUID()}');`);
  const r=await json(`select credit_admin_plan_delete('basic','${admin}');`);
  assert.equal(r.deleted,false);assert.equal(r.members,1);
  assert.equal(await db.sql(`select count(*) from subscription_plans where id='basic';`),'1');
});
test('only an administrator can delete, and a missing plan says so',async()=>{
  await assert.rejects(db.sql(`select credit_admin_plan_delete('basic','${member}');`),/credit_admin_required/);
  await assert.rejects(db.sql(`select credit_admin_plan_delete('nope','${admin}');`),/credit_plan_not_found/);
});
test('browser roles cannot call it',async()=>{
  assert.equal(await db.sql(`select has_function_privilege('authenticated','public.credit_admin_plan_delete(text,uuid)','execute');`),'f');
});
