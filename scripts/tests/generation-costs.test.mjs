import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;let run;let uncertain;
const q=v=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
before(async()=>{
  db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`UPDATE profiles SET role='admin' WHERE id='${ids.a}';UPDATE model_prices SET unit_cost_usd=0.039 WHERE model='nano-banana';
    INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,consumed_units,status,model,billable_images,llm_usd,expires_at)
      VALUES ('${ids.a}','${randomUUID()}','pdp_image',date_trunc('month',now()),2,2,'succeeded','nano-banana',2,0.01,now());
    UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=1000000,unresolved_exposure_limit_microusd=1000000;`);
  run=JSON.parse(await db.sql(`SELECT begin_generation_v2(${q({userId:ids.c,key:randomUUID(),operation:'pdp_image',units:2,maxCostMicrousd:200000,inputHash:'a'.repeat(64),snapshot:{},inline:true})});`));
  const make=async(step,cost,images)=>JSON.parse(await db.sql(`SELECT prepare_generation_attempt('${run.id}','${run.lease_token}',${q({step,sequence:0,provider:'fal',model:'nano-banana',endpoint:images?'fal/test':'llm',requestHash:step,payload:{},price:{providerUnitMicrousd:cost,chargeUnitMicrousd:cost},maxCostMicrousd:cost,requestedImages:images})});`));
  const image=await make('image',50000,1);const llm=await make('llm',10000,0);uncertain=await make('uncertain',20000,1);await make('unsubmitted',10000,1);
  for(const [a,cost,images] of [[image,50000,1],[llm,10000,0]]){
    for(const patch of [{state:'submitting'},{state:'result_ready',costMicrousd:cost,returnedImages:images,meteringState:'observed',output:{}},{state:'stored',deliveredImages:images,output:{}}])
      await db.sql(`SELECT advance_generation_attempt('${a.id}','${run.lease_token}',${q(patch)});`);
  }
  await db.sql(`SELECT advance_generation_attempt('${uncertain.id}','${run.lease_token}','{"state":"submitting"}');SELECT advance_generation_attempt('${uncertain.id}','${run.lease_token}','{"state":"unknown"}');
    UPDATE generation_events SET model='nano-banana',billable_images=20,llm_usd=999 WHERE id='${run.event_id}';`);
});
after(async()=>{await db?.close();});
test('T25: V1 and V2 costs are counted once, unsubmitted holds are excluded and unknown calls are visible',async()=>{
  const row=JSON.parse(await db.sql('SELECT row_to_json(s) FROM admin_cost_summary_v2() s;'));
  assert.equal(Number(row.total_usd),0.168);assert.equal(row.total_images,3);assert.equal(row.unknown_calls,1);
  assert.equal(await db.sql("SELECT has_function_privilege('authenticated','admin_cost_summary_v2()','EXECUTE');"),'f');
});
test('T25: changing the editable legacy price does not rewrite past recorded cost',async()=>{
  await db.sql("UPDATE model_prices SET unit_cost_usd=9 WHERE model='nano-banana';");
  assert.equal(Number(await db.sql('SELECT total_usd FROM admin_cost_summary_v2();')),0.168);
});
test('only an administrator can change generation budgets, with an audit record',async()=>{
  await assert.rejects(db.sql(`SELECT set_generation_controls('${ids.b}',true,2000000,2000000,'attempt');`),/admin_required/);
  await db.sql(`SELECT set_generation_controls('${ids.a}',false,2000000,2000000,'planned deployment');`);
  assert.equal(await db.sql("SELECT admission_enabled FROM usage_controls;"),'f');
  assert.equal(await db.sql("SELECT count(*) FROM usage_audit_events WHERE action='set_generation_controls';"),'1');
});
test('operator reconciliation requires identity and evidence and preserves recorded provider cost',async()=>{
  await assert.rejects(db.sql(`SELECT resolve_generation_attempt('${ids.b}','${uncertain.id}',20000,'receipt','confirmed failure');`),/admin_required/);
  await assert.rejects(db.sql(`SELECT resolve_generation_attempt('${ids.a}','${uncertain.id}',20000,'','confirmed failure');`),/evidence_required/);
  await db.sql(`SELECT resolve_generation_attempt('${ids.a}','${uncertain.id}',20000,'provider receipt 1','confirmed no delivery');`);
  assert.equal(await db.sql(`SELECT state||':'||billable_state FROM generation_attempts WHERE id='${uncertain.id}';`),'failed:reconciled');
  assert.equal(await db.sql("SELECT count(*) FROM usage_audit_events WHERE action='resolve_generation_attempt';"),'1');
  assert.equal(Number(await db.sql('SELECT total_usd FROM admin_cost_summary_v2();')),0.168);
});
test('known legacy spending is included in the new daily admission budget',async()=>{
  await db.sql('UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=300000;');
  await assert.rejects(db.sql(`SELECT begin_generation_v2(${q({userId:ids.b,key:randomUUID(),operation:'pdp_image',units:1,maxCostMicrousd:50000,inputHash:'b'.repeat(64),snapshot:{},inline:true})});`),/provider_budget_exceeded/);
});
test('deployment resumes the old policy only after matching heartbeat and preserves intervening operator edits',async()=>{
  const release='a'.repeat(40);
  const pause=JSON.parse(await db.sql(`SELECT pause_generation_for_deploy('${release}');`));
  assert.equal(pause.wasEnabled,true);assert.equal(await db.sql('SELECT admission_enabled FROM usage_controls;'),'f');
  await assert.rejects(db.sql(`SELECT resume_generation_after_deploy('${pause.pauseId}','${release}');`),/executor_unavailable/);
  await db.sql(`SELECT record_generation_executor_tick('fixture','${release}',true,null);`);
  assert.equal(await db.sql(`SELECT resume_generation_after_deploy('${pause.pauseId}','${release}');`),'t');
  assert.equal(await db.sql('SELECT admission_enabled FROM usage_controls;'),'t');
  const next=JSON.parse(await db.sql(`SELECT pause_generation_for_deploy('${release}');`));
  await db.sql(`SELECT set_generation_controls('${ids.a}',false,2000000,2000000,'operator changed policy');`);
  assert.equal(await db.sql(`SELECT resume_generation_after_deploy('${next.pauseId}','${release}');`),'f');
  assert.equal(await db.sql('SELECT admission_enabled FROM usage_controls;'),'f');
});
