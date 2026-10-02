import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

const repair=readFileSync(new URL('../../supabase/migrations/202610020003_member_delete_repair.sql',import.meta.url),'utf8');
const admin=randomUUID();let db;
const json=async q=>JSON.parse(await db.sql(q));
async function member(){const id=randomUUID();await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${id}','${id}@example.invalid',now());`);return id;}
const grant=id=>db.sql(`select credit_admin_grant('${id}','purchase',10,1000,null,'${randomUUID()}','fixture','${admin}');`);
before(async()=>{
  db=await testPostgres();await db.migrate([],{until:'202610020002'});
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','repair-admin@example.invalid',now()); update profiles set role='admin' where id='${admin}';
    alter table credit_accounts drop constraint credit_accounts_user_id_fkey;
    alter table credit_accounts add constraint credit_accounts_user_id_fkey foreign key(user_id) references profiles(id);
    drop function credit_member_has_records(uuid);`);
  if(process.env.SKIP_DELETE_REPAIR!=='1')await db.sql(repair);
});
after(async()=>{await db?.close();});

test('empty account deletes through Auth and removes only its profile and wallet',async()=>{
 const id=await member(),other=await member();
 await db.sql(`delete from auth.users where id='${id}';`);
 assert.equal(await db.sql(`select credit_member_has_records('${id}');`),'f');
 for(const [table,col] of [['auth.users','id'],['profiles','id'],['credit_accounts','user_id']]) assert.equal(await db.sql(`select count(*) from ${table} where ${col}='${id}';`),'0');
 assert.equal(await db.sql(`select count(*) from credit_accounts where user_id='${other}';`),'1');
});
test('historical grants remain protected even after expiry or revocation',async()=>{
 const id=await member();await grant(id);
 await db.sql(`update credit_grants set revoked_at=now(),revoked_by='${admin}',revoked_reason='fixture' where user_id='${id}';`);
 assert.equal(await db.sql(`select credit_member_has_records('${id}');`),'t');
 await assert.rejects(db.sql(`delete from auth.users where id='${id}';`),/foreign key/);
 assert.equal(await db.sql(`select count(*) from credit_accounts where user_id='${id}';`),'1');
 assert.equal(await db.sql(`select granted_units from credit_grants where user_id='${id}';`),'10');
});
test('subscription-only members and administrators with financial audit records cannot be deleted',async()=>{
 const id=await member();await db.sql(`select credit_admin_plan('repair','Repair',10,1000,true,'${admin}');select credit_admin_subscription('${id}','repair','active',now(),null,'${admin}');`);
 for(const target of [id,admin]){
  assert.equal(await db.sql(`select credit_member_has_records('${target}');`),'t');
  await assert.rejects(db.sql(`delete from auth.users where id='${target}';`),/foreign key/);
 }
});
test('repair is repeatable and does not enroll, grant, or rewrite balances',async()=>{
 const snapshot=()=>json(`select jsonb_build_object('accounts',(select jsonb_agg(to_jsonb(a) order by user_id) from credit_accounts a),'grants',(select jsonb_agg(to_jsonb(g) order by id) from credit_grants g),'subscriptions',(select jsonb_agg(to_jsonb(s) order by user_id) from user_subscriptions s))`);
 const before=await snapshot();await db.sql(repair);await db.sql(repair);assert.deepEqual(await snapshot(),before);
 const fks=await json(`select jsonb_object_agg(conname,confdeltype) from pg_constraint where confrelid='profiles'::regclass and conrelid in('credit_accounts'::regclass,'credit_grants'::regclass,'user_subscriptions'::regclass,'subscription_periods'::regclass)`);
 assert.equal(fks.credit_accounts_user_id_fkey,'c');for(const [name,kind]of Object.entries(fks))if(name!=='credit_accounts_user_id_fkey')assert.equal(kind,'a');
});
test('browser roles cannot inspect arbitrary members while service_role can',async()=>{
 for(const role of ['anon','authenticated'])await assert.rejects(db.sql(`set role ${role}; select credit_member_has_records('${admin}');`),/permission denied/);
 assert.equal(await db.sql(`set role service_role; select credit_member_has_records('${admin}');`),'t');
});
test('a simultaneous grant and deletion cannot erase a committed grant',async()=>{
 const id=await member();const results=await Promise.allSettled([grant(id),db.sql(`delete from auth.users where id='${id}';`)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const state=await json(`select jsonb_build_object('member',exists(select 1 from profiles where id='${id}'),'wallet',exists(select 1 from credit_accounts where user_id='${id}'),'grant',exists(select 1 from credit_grants where user_id='${id}'))`);
 assert.equal(state.member,state.grant);assert.equal(state.wallet,state.grant);
});
