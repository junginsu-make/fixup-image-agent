import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres, seedMembers, ids } from '../lib/test-postgres.mjs';

let db;
before(async () => { db = await testPostgres(); await db.migrate(); await seedMembers(db); });
after(async () => { await db?.close(); });

test('T29: a teammate can read the cards of the shared project', async () => {
  await db.sql(`INSERT INTO sns_projects(id,user_id,title,ratio,model_id) VALUES ('${ids.project}','${ids.a}','test','1:1','nano-banana');
    INSERT INTO sns_cards(user_id,project_id,index,role) VALUES ('${ids.a}','${ids.project}',0,'cover');`);
  const count = await db.sql(`BEGIN; SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claim.sub='${ids.b}'; SELECT count(*) FROM sns_cards WHERE project_id='${ids.project}'; ROLLBACK;`);
  assert.equal(count, '1', 'team child RLS must correlate with the outer card project_id');
});

test('T29: a self-referencing folder must not expose another teams cards', async () => {
  const other='30000000-0000-4000-8000-000000000002';
  await db.sql(`INSERT INTO projects(id,team_id,name) VALUES ('${ids.project}','${ids.team}','same uuid folder');
    UPDATE sns_projects SET project_id='${ids.project}' WHERE id='${ids.project}';
    INSERT INTO sns_projects(id,user_id,title,ratio,model_id) VALUES ('${other}','${ids.c}','foreign','1:1','nano-banana');
    INSERT INTO sns_cards(user_id,project_id,index,role) VALUES ('${ids.c}','${other}',0,'cover');`);
  const count=await db.sql(`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='${ids.b}'; SELECT count(*) FROM sns_cards; ROLLBACK;`);
  assert.equal(count,'1');
});

test('T04: an authenticated member cannot remove the server settlement pointer', async () => {
  const writable = await db.sql(`SELECT has_column_privilege('authenticated','public.poster_projects','data','UPDATE');`);
  assert.equal(writable, 'f', 'server execution data must not be directly writable by the browser');
});

test('T01: a completed generation is still charged after another admission cleans expired holds', async () => {
  const request = randomUUID();
  await db.sql(`SELECT * FROM reserve_generation('${ids.a}','${request}','poster_image',8);
    UPDATE generation_events SET expires_at=now()-interval '1 second' WHERE request_id='${request}';
    SELECT * FROM reserve_generation('${ids.a}','${randomUUID()}','pdp_analyze',0);
    SELECT * FROM finalize_generation('${ids.a}','${request}',true,8);`);
  assert.equal(await db.sql(`SELECT consumed_units FROM generation_events WHERE request_id='${request}';`), '8');
});

test('T14: two concurrent users cannot reserve beyond a shared team budget', async () => {
  await db.sql('DELETE FROM generation_events;');
  const first = db.sql(`BEGIN; SELECT allowed FROM reserve_generation('${ids.a}','${randomUUID()}','poster_image',8); SELECT pg_sleep(0.5); COMMIT;`);
  await new Promise(resolve => setTimeout(resolve, 100));
  const second = db.sql(`SELECT allowed FROM reserve_generation('${ids.b}','${randomUUID()}','poster_image',8);`);
  await Promise.all([first, second]);
  const held = Number(await db.sql("SELECT coalesce(sum(requested_units),0) FROM generation_events WHERE status='reserved';"));
  assert.ok(held <= 10, `team quota 10, held ${held}`);
});
