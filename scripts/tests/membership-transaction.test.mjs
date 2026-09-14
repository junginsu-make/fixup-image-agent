import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`UPDATE profiles SET role='admin' WHERE id='${ids.c}'; UPDATE team_members SET role='leader' WHERE user_id='${ids.a}';
    INSERT INTO sns_projects(id,user_id,title,ratio,model_id) VALUES ('${ids.project}','${ids.b}','test','1:1','nano-banana');`);
});
after(async()=>{await db?.close();});
test('T15: moving membership and owned work is atomic and preserves the original event team',async()=>{
  await db.sql(`SELECT * FROM reserve_generation('${ids.b}','50000000-0000-4000-8000-000000000001','pdp_image',3);
    SELECT change_team_membership_v2('${ids.c}','${ids.b}','assign','${ids.otherTeam}','member');`);
  assert.equal(await db.sql(`SELECT team_id FROM sns_projects WHERE id='${ids.project}';`),ids.otherTeam);
  assert.equal(await db.sql(`SELECT team_id FROM generation_events WHERE user_id='${ids.b}';`),ids.team);
});
test('T15: even an admin cannot remove or demote the last leader',async()=>{
  for(const action of ['remove','role','assign']) await assert.rejects(db.sql(`SELECT change_team_membership_v2('${ids.c}','${ids.a}','${action}','${ids.otherTeam}','member');`),/last_team_leader/);
});
test('T15: a team leader cannot pull someone out of another team',async()=>{
  await assert.rejects(db.sql(`SELECT change_team_membership_v2('${ids.a}','${ids.b}','assign','${ids.team}','member');`),/team_write_denied/);
});
test('T15: failure while moving work rolls back the membership change',async()=>{
  await db.sql(`CREATE FUNCTION test_reject_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_storage_failure'; END $$;
    CREATE TRIGGER test_reject_move BEFORE UPDATE ON sns_projects FOR EACH ROW EXECUTE FUNCTION test_reject_move();`);
  await assert.rejects(db.sql(`SELECT change_team_membership_v2('${ids.c}','${ids.b}','assign','${ids.team}','member');`),/test_storage_failure/);
  assert.equal(await db.sql(`SELECT team_id FROM team_members WHERE user_id='${ids.b}';`),ids.otherTeam);
});
test('T15: team archive is admin-only and atomically restores personal ownership',async()=>{
  await db.sql('DROP TRIGGER test_reject_move ON sns_projects;');
  await assert.rejects(db.sql(`SELECT archive_team_v2('${ids.a}','${ids.otherTeam}');`),/admin_required/);
  await db.sql(`SELECT archive_team_v2('${ids.c}','${ids.otherTeam}');`);
  assert.equal(await db.sql(`SELECT count(*) FROM team_members WHERE team_id='${ids.otherTeam}';`),'0');
  assert.equal(await db.sql(`SELECT team_id IS NULL FROM sns_projects WHERE id='${ids.project}';`),'t');
});
