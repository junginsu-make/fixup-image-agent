import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;let run;
const character=randomUUID();const foreign=randomUUID();
const headers=token=>JSON.stringify({'x-generation-run':run.id,'x-generation-lease':token});
before(async()=>{
  db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`INSERT INTO characters(id,user_id,name,source_prompt,identity_prompt) VALUES ('${character}','${ids.a}','own','p','p'),('${foreign}','${ids.b}','other','p','p');
    INSERT INTO character_views(character_id,user_id,angle,path) VALUES ('${character}','${ids.a}','front','${ids.a}/${character}/front.png');
    UPDATE usage_controls SET admission_enabled=true,daily_cost_limit_microusd=10000000,unresolved_exposure_limit_microusd=10000000;
    GRANT SELECT,UPDATE,DELETE ON characters,character_views TO service_role;`);
  run=JSON.parse(await db.sql(`SELECT begin_generation_v2('${JSON.stringify({userId:ids.a,key:randomUUID(),operation:'pdp_image',units:1,maxCostMicrousd:50000,inputHash:'a'.repeat(64),resourceType:'character',resourceId:character,snapshot:{kind:'sync_image'},inline:true})}');`));
});
after(async()=>{await db?.close();});
test('T12: character metadata accepts the current fence but rejects the expired executor',async()=>{
  const old=run.lease_token;
  await db.sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.headers='${headers(old)}';UPDATE character_views SET path='${ids.a}/${character}/first.png' WHERE character_id='${character}';COMMIT;`);
  await db.sql(`UPDATE generation_runs SET lease_until=now()-interval '1 second' WHERE id='${run.id}';`);
  run=JSON.parse(await db.sql(`SELECT claim_generation_run('${run.id}');`));
  await assert.rejects(db.sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.headers='${headers(old)}';UPDATE character_views SET path='stale' WHERE character_id='${character}';COMMIT;`),/lease_lost/);
  await db.sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.headers='${headers(run.lease_token)}';UPDATE character_views SET path='${ids.a}/${character}/current.png' WHERE character_id='${character}';COMMIT;`);
  assert.equal(await db.sql(`SELECT path FROM character_views WHERE character_id='${character}';`),`${ids.a}/${character}/current.png`);
});
test('T27: ordinary deletion cannot erase a character owned by an active execution',async()=>{
  await assert.rejects(db.sql(`DELETE FROM characters WHERE id='${character}';`),/generation_active/);
  await assert.rejects(db.sql(`DELETE FROM character_views WHERE character_id='${character}';`),/generation_active/);
});
test('a service-role generation fence cannot write another owners character',async()=>{
  await assert.rejects(db.sql(`BEGIN;SET LOCAL ROLE service_role;SET LOCAL request.headers='${headers(run.lease_token)}';UPDATE characters SET name='forged' WHERE id='${foreign}';COMMIT;`),/not_owner/);
});
test('front-only character storage completes successfully with zero customer credits',async()=>{
  const stored=JSON.parse(await db.sql(`SELECT begin_generation_v2('${JSON.stringify({userId:ids.c,key:randomUUID(),operation:'pdp_image',units:0,maxCostMicrousd:1,inputHash:'b'.repeat(64),snapshot:{kind:'sync_image',allowNoNewImages:true},inline:true})}');`));
  await db.sql(`SELECT checkpoint_generation_run('${stored.id}','${stored.lease_token}','{"businessSuccess":true}','settlement_pending',0);`);
  const result=JSON.parse(await db.sql(`SELECT settle_generation_v2('${stored.id}','${stored.lease_token}');`));
  assert.equal(result.state,'succeeded');assert.equal(await db.sql(`SELECT consumed_units FROM generation_events WHERE id='${stored.event_id}';`),'0');
});
