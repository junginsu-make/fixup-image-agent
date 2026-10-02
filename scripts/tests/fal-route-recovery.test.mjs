import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';
import { createPoolRouter } from '../../apps/web/lib/fal/pool/router.ts';
import { sealFalKey } from '../../apps/web/lib/fal/pool/key-crypto.ts';
import { createFalQueueClient } from '../../apps/web/lib/fal/queue.ts';
import { isFalReceipt } from '../../apps/web/lib/fal/request-id.ts';

let db;
const admin=randomUUID(),member=randomUUID(),account=randomUUID(),master=Buffer.alloc(32,9);
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const json=async sql=>JSON.parse(await db.sql(sql));
before(async()=>{
  db=await testPostgres();await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values(${q(admin)},'admin@example.invalid',now()),(${q(member)},'member@example.invalid',now());update profiles set role='admin' where id=${q(admin)};`);
  const sealed=sealFalKey(master,account,'fixture-pool-key');
  await db.sql(`select fal_account_add(${q(admin)},${q(account)},'fixture',${q(sealed.ciphertext)},${q(sealed.iv)},${q(sealed.tag)},'AAAA',1);select credit_admin_grant(${q(member)},'bonus',10,0,now()+interval '1 day','fixture-grant','fixture',${q(admin)});`);
});
after(async()=>{await db?.close();});

function store({failBind=false,loseAck=false,failRead=false}={}) {
  return {
    async liveAccounts(){if(failRead)throw new Error('injected read outage');return json(`select coalesce(json_agg(a),'[]') from (select * from fal_accounts where deleted_at is null) a;`);},
    async claim(endpoint,exclude){const rows=await json(`select coalesce(json_agg(c),'[]') from fal_account_claim(${q(endpoint)},array[${exclude.map(q).join(',')}]::uuid[]) c;`);return rows[0]?{slotId:Number(rows[0].slot_id),accountId:rows[0].account_id}:null;},
    async bind(slot,id){if(failBind)throw new Error('injected bind outage');await db.sql(`select fal_request_bind(${slot},${q(id)});`);if(loseAck)throw new Error('injected lost ACK');},
    release:slot=>db.sql(`select fal_request_release(${slot});`),
    finish:id=>db.sql(`select fal_request_finish(${q(id)});`),
    accountOf:async id=>(await db.sql(`select account_id from fal_requests where fal_request_id=${q(id)};`))||null,
    mark:async()=>false,
  };
}
const make=(s,submit=async()=>`provider-${randomUUID()}`)=>createPoolRouter({store:s,masterKey:master,environment:{FAL_KEY:'wrong-account-key'},alert:()=>{},log:()=>{},submit});
async function reset(){await db.sql('truncate fal_requests restart identity;');}

test('bind outage + restart preserves account, provider ID and a single credit settlement',async()=>{
  await reset();let submissions=0;
  const raw='provider-'+randomUUID();
  const accepted=await make(store({failBind:true}),async()=>{submissions++;return raw;}).submit('fal-ai/fixture',{});
  assert.equal(isFalReceipt(accepted.requestId),true);
  const request=randomUUID(),job='poster:'+randomUUID();
  await db.sql(`select credit_reserve(${q(member)},${q(request)},'poster_image',array[1],'poster:fixture',10);select credit_bind_job(${q(member)},${q(request)},${q(job)},'poster:fixture',${q(accepted.requestId)},'fal-ai/fixture');`);
  const binding=await json(`select credit_lookup_job(${q(member)},${q(job)});`);
  const seen=[];
  const client=createFalQueueClient(make(store()),key=>({
    async status(_endpoint,id){seen.push([key,id]);return 'completed';},
    async result(_endpoint,id){seen.push([key,id]);return {images:[{url:'https://example.invalid/fixture.png'}]};},
    async cancel(){},
  }));
  assert.equal(await client.jobStatus('fal-ai/fixture',binding.provider_request_id),'completed');
  assert.equal((await client.jobResult('fal-ai/fixture',binding.provider_request_id)).images.length,1);
  assert.deepEqual(seen,[['fixture-pool-key',raw],['fixture-pool-key',raw]]);
  assert.equal(await db.sql(`select fal_account_open_count(${q(account)});`),'0');
  await db.sql(`select credit_finalize_dispatch(${q(member)},${q(request)},true,0,1,true,null);select credit_finalize_dispatch(${q(member)},${q(request)},true,0,1,true,null);`);
  const wallet=await json(`select credit_summary(${q(member)});`);
  assert.equal(wallet.available,9);assert.equal(wallet.reserved,0);assert.equal(submissions,1);
  await assert.doesNotReject(make(store()).submit('fal-ai/fixture',{}));
});
test('an ACK lost after commit retains the mapping and cleanup is idempotent',async()=>{
  await reset();const accepted=await make(store({loseAck:true})).submit('fal-ai/fixture',{});
  assert.equal(isFalReceipt(accepted.requestId),true);
  const restarted=make(store());assert.equal((await restarted.routeOf(accepted.requestId)).accountId,account);
  await restarted.finished(accepted.requestId);await restarted.finished(accepted.requestId);
  assert.equal(await db.sql(`select fal_account_open_count(${q(account)});`),'0');
  assert.equal(await db.sql('select count(*) from fal_requests;'),'1');
});
test('cold read failure cannot turn a persisted pool request into an environment-key request',async()=>{
  await reset();const accepted=await make(store()).submit('fal-ai/fixture',{});
  assert.equal(isFalReceipt(accepted.requestId),false);
  await assert.rejects(make(store({failRead:true})).routeOf(accepted.requestId),e=>e.status===undefined);
  assert.equal((await make(store()).routeOf(accepted.requestId)).accountId,account);
});
test('cleanup stays correct if a delayed bind races with releasing the unbound slot',async()=>{
  await reset();const raw='provider-'+randomUUID();
  const accepted=await make(store({failBind:true}),async()=>raw).submit('fal-ai/fixture',{});
  // Bind first wins its row lock, then cleanup must finish its bound row.
  const binding=db.sql(`begin;select fal_request_bind(1,${q(raw)});select pg_sleep(.2);commit;`);
  await new Promise(resolve=>setTimeout(resolve,50));
  await Promise.all([binding,make(store()).finished(accepted.requestId)]);
  assert.equal(await db.sql(`select fal_account_open_count(${q(account)});`),'0');
  // Cleanup first deletes an unbound slot; a late bind cannot resurrect it.
  await reset();const next=await make(store({failBind:true}),async()=>raw).submit('fal-ai/fixture',{});
  await make(store()).finished(next.requestId);await db.sql(`select fal_request_bind(1,${q(raw)});`);
  assert.equal(await db.sql(`select fal_account_open_count(${q(account)});`),'0');
});
