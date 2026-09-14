import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
    CREATE POLICY test_broad_storage_access ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
    INSERT INTO storage.objects(bucket_id,name) VALUES ('generation-internal','${ids.a}/run/result.json');`);
});
after(async()=>{await db?.close();});
test('internal cached responses remain inaccessible even under another broad storage policy',async()=>{
  assert.equal(await db.sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='${ids.a}';SELECT count(*) FROM storage.objects WHERE bucket_id='generation-internal';ROLLBACK;`),'0');
  await assert.rejects(db.sql(`BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='${ids.a}';INSERT INTO storage.objects(bucket_id,name) VALUES ('generation-internal','${ids.a}/fake');COMMIT;`),/row-level security/);
});
test('inline admission returns a lease atomically and is not claimed by a background worker',async()=>{
  await db.sql('UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=10000000,unresolved_exposure_limit_microusd=10000000;');
  const run=JSON.parse(await db.sql(`SELECT begin_generation_v2('{"userId":"${ids.a}","key":"70000000-0000-4000-8000-000000000001","operation":"layout_analyze","units":0,"maxCostMicrousd":1000000,"inputHash":"${'a'.repeat(64)}","snapshot":{},"inline":true}');`));
  assert.ok(run.lease_token);assert.equal(await db.sql(`SELECT claim_generation_run('${run.id}') IS NULL;`),'t');
  const duplicate=JSON.parse(await db.sql(`SELECT begin_generation_v2('{"userId":"${ids.a}","key":"70000000-0000-4000-8000-000000000001","operation":"layout_analyze","units":0,"maxCostMicrousd":1000000,"inputHash":"${'a'.repeat(64)}","snapshot":{},"inline":true}');`));
  assert.equal(duplicate.id,run.id);assert.equal(duplicate.lease_token,null,'a duplicate HTTP handler must not inherit the first handlers execution lease');
});
test('T17: concurrent free LLM requests share a single per-user execution allowance',async()=>{
  const calls=['layout_analyze','redesign_transcribe'].map(operation=>db.sql(`SELECT begin_generation_v2('${JSON.stringify({userId:ids.b,key:randomUUID(),operation,units:0,maxCostMicrousd:10000,inputHash:'b'.repeat(64),snapshot:{},inline:true})}');`));
  const results=await Promise.allSettled(calls);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(results.map(r=>r.status==='rejected'?String(r.reason):'accepted')));
  const rejected=results.find(r=>r.status==='rejected');
  assert.match(String(rejected.reason),/concurrent_limit/);
});
