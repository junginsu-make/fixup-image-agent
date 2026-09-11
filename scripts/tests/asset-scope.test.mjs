import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {testPostgres,seedMembers,ids} from '../lib/test-postgres.mjs';
let db;
const ref='40000000-0000-4000-8000-000000000001';
const own=`${ids.a}/references/${ref}.png`;
before(async()=>{db=await testPostgres();await db.migrate();await seedMembers(db);
  await db.sql(`INSERT INTO reference_images(id,user_id,storage_path,purpose) VALUES ('${ref}','${ids.a}','${own}','both');`);
});
after(async()=>{await db?.close();});
test('T06: metadata resolves own and team assets but rejects foreign or invented paths',async()=>{
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.a}',ARRAY['${own}']);`),'1');
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.b}',ARRAY['${own}']);`),'1');
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.c}',ARRAY['${own}']);`),'0');
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.a}',ARRAY['${ids.a}/references/not-a-record.png']);`),'0');
});
test('T06: an owned metadata row cannot authorize a path in someone elses namespace',async()=>{
  await db.sql(`INSERT INTO library_items(id,user_id,title,tool) VALUES ('${ids.project}','${ids.a}','forged metadata','create');
    INSERT INTO library_images(item_id,user_id,position,path) VALUES ('${ids.project}','${ids.a}',0,'${ids.c}/secret.png');`);
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.a}',ARRAY['${ids.c}/secret.png']);`),'0');
});
test('T06: storage paths cannot traverse their owner namespace',async()=>{
  const malformed=`${ids.a}/../${ids.c}/secret.png`;
  await db.sql(`INSERT INTO library_images(item_id,user_id,position,path) VALUES ('${ids.project}','${ids.a}',1,'${malformed}');`);
  assert.equal(await db.sql(`SELECT count(*) FROM accessible_generation_asset_paths('${ids.a}',ARRAY['${malformed}']);`),'0');
});
