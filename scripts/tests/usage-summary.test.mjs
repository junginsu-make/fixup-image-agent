import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);});
after(async()=>{await db?.close();});
test('T16: old-team usage does not exhaust the new teams allowance in the displayed summary',async()=>{
  await db.sql(`INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,consumed_units,status,expires_at,team_id)
    VALUES ('${ids.a}',gen_random_uuid(),'pdp_image',date_trunc('month',now() at time zone 'Asia/Seoul')::date,20,20,'succeeded',now(),'${ids.otherTeam}');`);
  assert.equal(await db.sql(`SELECT quota-used_units-reserved_units FROM member_usage_summary('${ids.a}');`),'10');
});
test('team summary aggregates more than a PostgREST page and keeps v2 holds after expiry',async()=>{
  await db.sql(`INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,consumed_units,status,expires_at,team_id)
    SELECT '${ids.a}',gen_random_uuid(),'pdp_image',date_trunc('month',now() at time zone 'Asia/Seoul')::date,1,1,'succeeded',now(),'${ids.team}' FROM generate_series(1,1100);
    INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,status,expires_at,team_id,protocol_version)
    VALUES ('${ids.b}',gen_random_uuid(),'sns_image',date_trunc('month',now() at time zone 'Asia/Seoul')::date,5,'reserved',now()-interval '1 day','${ids.team}',2);`);
  const result=JSON.parse(await db.sql(`SELECT team_credit_state_v2('${ids.team}');`));
  assert.equal(result.teamUsed,1105);assert.equal(result.members.find(m=>m.userId===ids.a).used,1120);
});
