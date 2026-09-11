import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres, seedMembers, ids } from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`UPDATE team_members SET role='leader' WHERE user_id='${ids.a}'; UPDATE profiles SET role='admin' WHERE id='${ids.c}';`);
});
after(async()=>{await db?.close();});
test('T13: leader cannot raise own, teammate, or team quota or disable team cap',async()=>{
  for(const [kind,target,value] of [['personal',ids.a,10000],['personal',ids.b,10000],['team',ids.team,1000000],['team',ids.team,0]]) {
    await assert.rejects(db.sql(`SELECT set_usage_quota_v2('${ids.a}','${kind}','${target}',${value},'test');`),/admin_required/);
  }
});
test('T13: administrator changes quota with immutable audit evidence',async()=>{
  await db.sql(`SELECT set_usage_quota_v2('${ids.c}','personal','${ids.a}',120,'approved test');`);
  assert.equal(await db.sql(`SELECT monthly_quota FROM profiles WHERE id='${ids.a}';`),'120');
  assert.equal(await db.sql("SELECT before_value->>'quota'||':'||(after_value->>'quota') FROM usage_audit_events WHERE action='quota_personal';"),'100:120');
});
