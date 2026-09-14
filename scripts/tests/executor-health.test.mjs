import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;let run;
const start=userId=>db.sql(`SELECT begin_generation_v2('${JSON.stringify({userId,key:randomUUID(),operation:'pdp_image',units:1,maxCostMicrousd:50000,inputHash:'a'.repeat(64),snapshot:{},inline:true})}');`);
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);await db.sql('UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=1000000,unresolved_exposure_limit_microusd=1000000;DELETE FROM generation_executor_health;');});
after(async()=>{await db?.close();});
test('T19: absent executor heartbeat blocks admission, successful empty ticks restore it',async()=>{
  await assert.rejects(start(ids.a),/executor_unavailable/);
  await db.sql("SELECT record_generation_executor_tick('fixture','test-release',true,null);");
  run=JSON.parse(await start(ids.a));
});
test('T19: stale heartbeat blocks a new provider submission but not existing result settlement',async()=>{
  const spec={step:'image',sequence:0,provider:'fal',model:'fixture',endpoint:'fal/test',requestHash:'h',payload:{},price:{chargeUnitMicrousd:50000},maxCostMicrousd:50000,requestedImages:1};
  const attempt=JSON.parse(await db.sql(`SELECT prepare_generation_attempt('${run.id}','${run.lease_token}','${JSON.stringify(spec)}');`));
  await db.sql("UPDATE generation_executor_health SET succeeded_at=now()-interval '6 minutes';");
  await assert.rejects(db.sql(`SELECT advance_generation_attempt('${attempt.id}','${run.lease_token}','{"state":"submitting"}');`),/executor_unavailable/);
  await db.sql("SELECT record_generation_executor_tick('fixture','test-release',true,null);");
  await db.sql(`SELECT advance_generation_attempt('${attempt.id}','${run.lease_token}','{"state":"submitting"}');`);
  await db.sql("UPDATE generation_executor_health SET succeeded_at=now()-interval '6 minutes';UPDATE usage_controls SET admission_enabled=false;");
  await db.sql(`SELECT advance_generation_attempt('${attempt.id}','${run.lease_token}','{"state":"result_ready","returnedImages":1,"costMicrousd":50000,"output":{"image":"fixture"}}');
    SELECT advance_generation_attempt('${attempt.id}','${run.lease_token}','{"state":"stored","deliveredImages":1,"output":{"path":"owned"}}');
    SELECT checkpoint_generation_run('${run.id}','${run.lease_token}','{}','settlement_pending',0);
    SELECT settle_generation_v2('${run.id}','${run.lease_token}');`);
  assert.equal(await db.sql(`SELECT consumed_units FROM generation_events WHERE id='${run.event_id}';`),'1');
});
