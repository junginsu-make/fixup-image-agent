import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);await db.sql('UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=10000000,unresolved_exposure_limit_microusd=10000000;');});
after(async()=>{await db?.close();});
const input=(userId,operation,extra={})=>({userId,key:randomUUID(),operation,units:0,maxCostMicrousd:1000,inputHash:'a'.repeat(64),snapshot:{},inline:true,...extra});
async function begin(value){return JSON.parse(await db.sql(`SELECT begin_generation_v2('${JSON.stringify(value)}');`));}
async function finish(r){await db.sql(`SELECT checkpoint_generation_run('${r.id}','${r.lease_token}','{"businessSuccess":false}','settlement_pending',0);SELECT settle_generation_v2('${r.id}','${r.lease_token}');`);}
test('PDP preserves its configured hourly limit and counts legacy approvals too',async()=>{
  await db.sql(`INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,status,consumed_units,expires_at) VALUES ('${ids.a}','${randomUUID()}','pdp_analyze',date_trunc('month',now()),0,'failed',0,now());`);
  await assert.rejects(begin(input(ids.a,'pdp_analyze',{pdpAnalysisLimit:1})),/analysis_rate_limit/);
  await finish(await begin(input(ids.a,'pdp_analyze',{pdpAnalysisLimit:2})));
});
test('the five free LLM operations share their specified 30/hour cap',async()=>{
  await finish(await begin(input(ids.b,'pdp_analyze')));
  await db.sql(`WITH history AS (
    INSERT INTO generation_events(user_id,request_id,operation,period_start,requested_units,status,consumed_units,expires_at,protocol_version)
    SELECT '${ids.b}',gen_random_uuid(),op,date_trunc('month',now()),0,'failed',0,now(),2
    FROM unnest(ARRAY['sns_plan','sns_caption','layout_analyze','poster_review','redesign_transcribe']) op CROSS JOIN generate_series(1,6) n
    WHERE NOT(op='layout_analyze' AND n=6) RETURNING *
  ) INSERT INTO generation_runs(user_id,event_id,idempotency_key,input_hash,operation,execution_snapshot,cost_day,max_cost_microusd,state)
    SELECT user_id,id,request_id,repeat('a',64),operation,'{}',(now() at time zone 'Asia/Seoul')::date,1,'failed' FROM history;`);
  await finish(await begin(input(ids.b,'layout_analyze')));
  await assert.rejects(begin(input(ids.b,'redesign_transcribe')),/analysis_rate_limit/);
});
