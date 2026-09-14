import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {testPostgres} from '../lib/test-postgres.mjs';
let db;
before(async()=>{db=await testPostgres();await db.migrate();});
after(async()=>{await db?.close();});
test('application operation type, actual DB check and V2 admission whitelist agree',async()=>{
  const source=await readFile(new URL('../../apps/web/lib/generation/operations.ts',import.meta.url),'utf8');
  const expected=JSON.parse(/GENERATION_OPERATIONS = (\[[\s\S]*?\]) as const/.exec(source)[1]).sort();
  const constraint=await db.sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='generation_events_operation_check';");
  const actual=[...constraint.matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual(actual,expected);
  const rpc=await db.sql("SELECT pg_get_functiondef('begin_generation_v2(jsonb)'::regprocedure);");
  const allowed=/op not in \(([^)]+)\)/.exec(rpc)[1];
  assert.deepEqual([...allowed.matchAll(/'([^']+)'/g)].map(m=>m[1]).sort(),expected);
});
