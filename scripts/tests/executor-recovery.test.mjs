import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;let run;let attempt;
before(async()=>{
  db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=1000000,unresolved_exposure_limit_microusd=1000000;
    INSERT INTO poster_projects(id,user_id,title,ratio,model_id) VALUES ('${ids.project}','${ids.a}','poster','1:1','nano-banana');`);
  run=JSON.parse(await db.sql(`SELECT begin_generation_v2('${JSON.stringify({userId:ids.a,key:randomUUID(),operation:'poster_image',units:1,resourceType:'poster',resourceId:ids.project,maxCostMicrousd:50000,inputHash:'a'.repeat(64),snapshot:{},inline:true})}');`));
  attempt=JSON.parse(await db.sql(`SELECT prepare_generation_attempt('${run.id}','${run.lease_token}','${JSON.stringify({step:'image',sequence:0,provider:'fal',model:'fixture',endpoint:'fal/test',requestHash:'h',payload:{},price:{},maxCostMicrousd:50000,requestedImages:1})}');`));
  await db.sql(`SELECT advance_generation_attempt('${attempt.id}','${run.lease_token}','{"state":"submitting"}');`);
});
after(async()=>{await db?.close();});
test('T10: acceptance recovery waits for a live owner then restores the same provider ID once',async()=>{
  const recover=()=>db.sql(`SELECT recover_generation_acceptance('${run.id}','${attempt.id}','accepted-id');`);
  assert.equal(await recover(),'f');
  await db.sql(`UPDATE generation_runs SET lease_until=now()-interval '1 second' WHERE id='${run.id}';`);
  assert.equal(await recover(),'t');assert.equal(await recover(),'t');
  assert.equal(await db.sql(`SELECT provider_request_id||':'||state FROM generation_attempts WHERE id='${attempt.id}';`),'accepted-id:submitted');
  assert.equal(await db.sql(`SELECT count(*) FROM usage_audit_events WHERE target_id='${attempt.id}' AND action='recover_acceptance';`),'1');
  await assert.rejects(db.sql(`SELECT recover_generation_acceptance('${run.id}','${attempt.id}','different-id');`),/provider_identity_conflict/);
});
