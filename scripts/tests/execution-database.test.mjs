import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres, seedMembers, ids } from '../lib/test-postgres.mjs';
let db;
before(async () => { db=await testPostgres(); await db.migrate(); await seedMembers(db);
  await db.sql(`INSERT INTO poster_projects(id,user_id,title,ratio,model_id) VALUES ('${ids.project}','${ids.a}','test','1:1','nano-banana');`);
});
after(async () => { await db?.close(); });
const quote = v => `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
const input = (key=randomUUID(), override={}) => ({userId:ids.a,key,operation:'poster_image',units:8,resourceType:'poster',resourceId:ids.project,inputHash:'a'.repeat(64),snapshot:{},maxCostMicrousd:400000,...override});
async function begin(x=input()) {
  return JSON.parse(await db.sql(`SELECT begin_generation_v2(${quote(x)});`));
}

test('T19: missing launch policy prevents new provider exposure', async () => {
  await assert.rejects(begin(), /admission_closed/);
});
test('v2 records immutable owner/period and identical-key replay, conflicting key is rejected', async () => {
  await db.sql('UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=10000000,unresolved_exposure_limit_microusd=10000000;');
  const x=input(); const a=await begin(x); const b=await begin(x);
  assert.equal(a.id,b.id);
  await assert.rejects(begin({...x,inputHash:'b'.repeat(64)}), /idempotency_conflict/);
  assert.equal(await db.sql(`SELECT user_id FROM generation_runs WHERE id='${a.id}';`),ids.a);
  assert.equal(await db.sql("SELECT has_table_privilege('authenticated','generation_runs','UPDATE');"),'f');
});
test('T26: legacy cleanup must preserve expired v2 holds and prevent another paid request', async () => {
  await db.sql("UPDATE generation_events SET expires_at=now()-interval '1 day' WHERE protocol_version=2;");
  const r=await db.sql(`SELECT reason FROM reserve_generation('${ids.a}','${randomUUID()}','poster_image',1);`);
  assert.equal(r,'concurrent_limit');
  assert.equal(await db.sql("SELECT count(*) FROM generation_events WHERE protocol_version=2 AND status='reserved';"),'1');
});
test('T12: active lease is exclusive, expired lease has a different fence', async () => {
  const a=JSON.parse(await db.sql('SELECT claim_generation_run();'));
  assert.ok(a.lease_token);
  assert.equal(await db.sql('SELECT claim_generation_run() IS NULL;'),'t');
  await db.sql(`UPDATE generation_runs SET lease_until=now()-interval '1 second' WHERE id='${a.id}';`);
  const b=JSON.parse(await db.sql('SELECT claim_generation_run();'));
  assert.notEqual(a.lease_token,b.lease_token);
  assert.ok(b.lease_epoch>a.lease_epoch);
});

test('T11: durable output settles once, duplicate completion cannot charge twice', async () => {
  const row=JSON.parse(await db.sql("SELECT row_to_json(r) FROM generation_runs r LIMIT 1;"));
  const spec={step:'image-0',sequence:0,provider:'fal',model:'nano-banana',endpoint:'fal-ai/test',requestHash:'x',payload:{},price:{chargeUnitMicrousd:400000},maxCostMicrousd:400000,requestedImages:1};
  const a=JSON.parse(await db.sql(`SELECT prepare_generation_attempt('${row.id}','${row.lease_token}',${quote(spec)});`));
  for(const patch of [{state:'submitting'},{state:'submitted',providerRequestId:'fal-test'},{state:'result_ready',returnedImages:1,costMicrousd:400000,meteringState:'estimated',output:{url:'https://example.invalid/result'}},{state:'stored',deliveredImages:1,output:{path:'owner/run/image.png'}}]) {
    await db.sql(`SELECT advance_generation_attempt('${a.id}','${row.lease_token}',${quote(patch)});`);
  }
  await db.sql(`SELECT checkpoint_generation_run('${row.id}','${row.lease_token}','{}','settlement_pending',0);`);
  const first=await db.sql(`SELECT settle_generation_v2('${row.id}','${row.lease_token}');`);
  const second=await db.sql(`SELECT settle_generation_v2('${row.id}','${row.lease_token}');`);
  assert.equal(first,second);
  assert.equal(await db.sql(`SELECT consumed_units FROM generation_events WHERE id='${row.event_id}';`),'8');
  assert.equal(await db.sql('SELECT reserved_cost_microusd FROM usage_budget_days;'),'0');
});

test('T12: stale executor cannot prepare a provider call', async () => {
  const row=JSON.parse(await db.sql('SELECT row_to_json(r) FROM generation_runs r LIMIT 1;'));
  await assert.rejects(db.sql(`SELECT prepare_generation_attempt('${row.id}','${randomUUID()}','{}');`), /lease_lost/);
});

test('T03/T19: yesterday unresolved exposure still counts against todays admission', async () => {
  await db.sql('UPDATE teams SET monthly_quota=100;');
  const old=await begin(input(randomUUID(),{userId:ids.c,operation:'redesign_generate',resourceType:null,resourceId:null}));
  await db.sql(`UPDATE usage_budget_days SET reserved_cost_microusd=reserved_cost_microusd-400000 WHERE day=(now() at time zone 'Asia/Seoul')::date;
    INSERT INTO usage_budget_days(day,reserved_cost_microusd) VALUES ((now() at time zone 'Asia/Seoul')::date-1,400000);
    UPDATE generation_runs SET cost_day=(now() at time zone 'Asia/Seoul')::date-1 WHERE id='${old.id}';
    UPDATE usage_controls SET daily_cost_limit_microusd=1000000;`);
  await assert.rejects(begin(input(randomUUID(),{userId:ids.b,operation:'redesign_generate',resourceType:null,resourceId:null})),/provider_budget_exceeded/);
});

test('draft edits survive executor checkpoints for the same SNS project',async()=>{
  await db.sql('UPDATE usage_controls SET daily_cost_limit_microusd=10000000;');
  await db.sql(`INSERT INTO sns_projects(id,user_id,title,ratio,model_id,data) VALUES ('${ids.project}','${ids.a}','sns','1:1','nano-banana','{"flow":{"cards":[{"copy":{"headline":"old"}}]}}');`);
  const run=await begin(input(randomUUID(),{operation:'sns_image',resourceType:'sns',units:3,maxCostMicrousd:100000,snapshot:{customerLlmUnitMicrousd:14000,initialFlow:{cards:[{copy:{headline:'old'}}]}}}));
  await db.sql(`SELECT save_sns_draft_v2('${ids.a}','${ids.project}','{"cards":[{"copy":{"headline":"new draft"}}]}','copy_ready');`);
  const claimed=JSON.parse(await db.sql(`SELECT claim_generation_run('${run.id}');`));
  await db.sql(`SELECT checkpoint_generation_run('${run.id}','${claimed.lease_token}','{"flow":{"cards":[{"copy":{"headline":"old result"}}]}}','running',0,false);`);
  assert.equal(await db.sql(`SELECT data#>>'{flow,cards,0,copy,headline}' FROM sns_projects WHERE id='${ids.project}';`),'new draft');
  assert.equal(await db.sql(`SELECT data#>>'{executionFlow,cards,0,copy,headline}' FROM sns_projects WHERE id='${ids.project}';`),'old result');
  await assert.rejects(db.sql(`SELECT save_sns_draft_v2('${ids.c}','${ids.project}','{}','copy_ready');`),/not_owner/);
  await db.sql(`INSERT INTO generation_attempts(run_id,logical_step,sequence,provider,model,endpoint,state,request_hash,request_payload,price_snapshot,estimated_cost_microusd,requested_images,returned_images,delivered_images,submitted_at)
    SELECT '${run.id}','image-'||n,n,'fal','m','e','stored','h','{}','{"chargeUnitMicrousd":39000}',39000,1,1,1,now() FROM generate_series(1,2)n;
    SELECT checkpoint_generation_run('${run.id}','${claimed.lease_token}','{"flow":{"generation":{"selectedCardIndexes":[1,2]},"cards":[{"index":1,"status":"done","falRequestId":"f1"},{"index":2,"status":"done","falRequestId":"f2"}]}}','settlement_pending',0);
    SELECT settle_generation_v2('${run.id}','${claimed.lease_token}');`);
  assert.equal(await db.sql(`SELECT consumed_units FROM generation_events WHERE id='${run.event_id}';`),'3');
});
test('late planning output cannot overwrite a newer draft',async()=>{
  const before=await db.sql(`SELECT updated_at FROM sns_projects WHERE id='${ids.project}';`);
  await db.sql(`SELECT save_sns_draft_v2('${ids.a}','${ids.project}','{"cards":[],"caption":"manual edit"}','copy_ready');`);
  await assert.rejects(db.sql(`SELECT save_sns_draft_checked('${ids.a}','${ids.project}','{"cards":[],"caption":"stale AI"}','copy_ready','${before}');`),/draft_conflict/);
  assert.equal(await db.sql(`SELECT data#>>'{flow,caption}' FROM sns_projects WHERE id='${ids.project}';`),'manual edit');
  const fresh=await db.sql(`SELECT updated_at FROM sns_projects WHERE id='${ids.project}';`);
  await db.sql(`SELECT save_sns_draft_checked('${ids.a}','${ids.project}','{"cards":[],"caption":"fresh AI"}','copy_ready','${fresh}');`);
  assert.equal(await db.sql(`SELECT data#>>'{flow,caption}' FROM sns_projects WHERE id='${ids.project}';`),'fresh AI');
});
