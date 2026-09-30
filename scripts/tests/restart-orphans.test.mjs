import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609290001 — 재시작 때 묶인 예약 정리(2026-09-29 설계 §3.5).
  서버가 죽거나 배포로 다시 뜨면, 직전 프로세스의 동기 생성 예약이 크레딧을 쥔 채 남는다.
  자기 것이 아닌 표식만, 허용 목록 자원만 고른다 — 카드뉴스·포스터는 재시작 뒤에도 이어진다.
*/
const admin = '80000000-0000-4000-8000-000000000001';
const OLD = '81000000-0000-4000-8000-000000000001';
const NOW = '81000000-0000-4000-8000-000000000002';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 사람 한 명 + 크레딧 100 + 예약 한 건. 동시 1건 규칙 때문에 예약마다 사람을 따로 둔다. */
async function reservation({ resource, operation, boot, started = false, bound = false }) {
  const user = randomUUID();
  const request = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.invalid',now());
    update profiles set status='active' where id='${user}';
    select credit_admin_grant('${user}','bonus',100,0,now()+interval '3 months','g-${user}','fixture','${admin}');`);
  const reserved = await json(`select credit_reserve('${user}','${request}','${operation}',array[1,1],'${resource}');`);
  assert.equal(reserved.allowed, true, JSON.stringify(reserved));
  if (boot) await db.sql(`update generation_events set boot_id='${boot}' where user_id='${user}' and request_id='${request}';`);
  if (started) await db.sql(`select credit_mark_started('${user}','${request}');`);
  if (bound) await db.sql(`insert into credit_jobs(user_id,request_id,job_key,resource_key,provider_request_id,endpoint) values('${user}','${request}','k-${request}','${resource}','p','e');`);
  return { user, request };
}
const row = (r) => json(`select to_jsonb(e) from (select status,credit_phase,error_code,cost_state from generation_events where user_id='${r.user}' and request_id='${r.request}') e;`);
const available = async (r) => (await json(`select credit_wallet_state('${r.user}');`)).available;

let cases;
before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
  cases = {
    reservedOld: await reservation({ resource: 'pdp:batch', operation: 'pdp_image', boot: OLD }),
    startedOld: await reservation({ resource: 'redesign:generate', operation: 'redesign_generate', boot: OLD, started: true }),
    sns: await reservation({ resource: 'sns:p1', operation: 'sns_image', boot: OLD, started: true }),
    poster: await reservation({ resource: 'poster:p1', operation: 'poster_image', boot: OLD }),
    job: await reservation({ resource: 'pdp:job', operation: 'pdp_image', boot: OLD }),
    mine: await reservation({ resource: 'pdp:image', operation: 'pdp_image', boot: NOW }),
    unmarked: await reservation({ resource: 'pdp:key-visual', operation: 'pdp_image', boot: null }),
    bound: await reservation({ resource: 'character:view', operation: 'pdp_image', boot: OLD, started: true, bound: true }),
  };
});
after(async () => { await db?.close(); });

test('closes only the previous process\'s allow-listed reservations', async () => {
  const result = await json(`select credit_close_restart_orphans('${NOW}');`);
  assert.deepEqual(result, { released: 1, needs_review: 1 });
});

test('a reservation that never reached the provider is released without charge', async () => {
  const r = await row(cases.reservedOld);
  assert.equal(r.status, 'failed');
  assert.equal(r.error_code, 'process_restart');
  assert.equal(await available(cases.reservedOld), 100);
});

test('a started reservation goes to the admin review list, still holding credits', async () => {
  const r = await row(cases.startedOld);
  assert.equal(r.status, 'reserved');
  assert.equal(r.credit_phase, 'needs_review');
  assert.equal(r.error_code, 'process_restart');
  assert.equal(r.cost_state, 'unknown');
  assert.equal(await available(cases.startedOld), 98);
});

test('card news, posters, dispatcher jobs, this process, unmarked and bound rows are untouched', async () => {
  for (const key of ['sns', 'poster', 'job', 'mine', 'unmarked', 'bound']) {
    const r = await row(cases[key]);
    assert.equal(r.status, 'reserved', key);
    assert.notEqual(r.error_code, 'process_restart', key);
  }
});

test('calling again closes nothing (idempotent)', async () => {
  assert.deepEqual(await json(`select credit_close_restart_orphans('${NOW}');`), { released: 0, needs_review: 0 });
});

test('a member session cannot run it', async () => {
  await assert.rejects(db.sql(`begin; set local role authenticated; select credit_close_restart_orphans('${NOW}'); commit;`));
});

test('a null boot id is refused', async () => {
  await assert.rejects(db.sql(`select credit_close_restart_orphans(null);`));
});
