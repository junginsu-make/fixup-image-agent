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
  assert.deepEqual(result, { released: 1, needs_review: 1, failed: 0 });
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
  assert.deepEqual(await json(`select credit_close_restart_orphans('${NOW}');`), { released: 0, needs_review: 0, failed: 0 });
});

test('a member session cannot run it', async () => {
  await assert.rejects(
    db.sql(`begin; set local role authenticated; select credit_close_restart_orphans('${NOW}'); commit;`),
    /permission denied for function credit_close_restart_orphans/,
  );
});

test('a null boot id is refused', async () => {
  await assert.rejects(db.sql(`select credit_close_restart_orphans(null);`));
});

/*
  독립 리뷰(opus) fix round 1 — Important 1.

  경쟁: 다른 트랜잭션(관리자 정산 등)이 우리가 고른 행을 우리가 손대기 전에 먼저
  닫으면, 상태 가드 없이 `where id=e.id` 만으로 덮어써 이미 닫힌 행이 다시
  `needs_review` 로 바뀌는 사고가 날 수 있다. `credit_lock()` 을 맨 먼저 잡아
  다른 돈 함수와 같은 순서로 직렬화하면, 세션 2 는 세션 1 이 커밋할 때까지
  기다렸다가 이미 정산된 최종 상태만 보게 된다.

  하네스는 `db.sql` 호출마다 새 세션(psql 프로세스)을 띄우므로, 두 문자열을
  `Promise.all` 로 동시에 보내면 실제로 두 트랜잭션이 겹친다.
*/
test('a concurrent settlement mid-scan is not overwritten', async () => {
  const target = await reservation({ resource: 'pdp:image', operation: 'pdp_image', boot: OLD, started: true });
  await Promise.all([
    db.sql(`begin; select credit_finalize('${target.user}','${target.request}',array[]::integer[],true,'admin_x'); select pg_sleep(1); commit;`),
    db.sql(`select pg_sleep(0.3); select credit_close_restart_orphans('${NOW}');`),
  ]);
  const r = await row(target);
  assert.equal(r.status, 'failed');
  assert.equal(r.credit_phase, 'settled');
  assert.equal(r.error_code, 'admin_x');
});

/*
  독립 리뷰(opus) fix round 1 — Important 2.

  한 건이 정산 중 예외를 내도(불변식 위반 등) 나머지 건은 계속 닫혀야 하고,
  실패한 건은 그대로 `reserved` 로 남아 다음 기동 때 다시 시도된다. 반환값의
  `failed` 로 몇 건이 걸렸는지도 보인다.
*/
test('one broken reservation does not block the rest, and is counted as failed', async () => {
  const broken = await reservation({ resource: 'pdp:key-visual', operation: 'pdp_image', boot: OLD });
  const normal = await reservation({ resource: 'pdp:image', operation: 'pdp_image', boot: OLD });
  // credit_finalize 의 실제 홀드(2)와 어긋나게 만들어 정산 중 check 제약(reserved_units >= 0)을 깨뜨린다.
  await db.sql(`update credit_grants set reserved_units = 0 where user_id = '${broken.user}';`);

  const result = await json(`select credit_close_restart_orphans('${NOW}');`);
  assert.deepEqual(result, { released: 1, needs_review: 0, failed: 1 });

  const brokenRow = await row(broken);
  assert.equal(brokenRow.status, 'reserved');
  assert.notEqual(brokenRow.error_code, 'process_restart');

  const normalRow = await row(normal);
  assert.equal(normalRow.status, 'failed');
  assert.equal(normalRow.error_code, 'process_restart');
});

/*
  독립 리뷰(opus) fix round 1 — Minor 2. service_role 은 하네스가 만든다
  (`CREATE ROLE service_role NOLOGIN BYPASSRLS`) — 실행 권한을 실제로 받았는지 확인.
*/
test('service_role can run it', async () => {
  await assert.doesNotReject(
    db.sql(`begin; set local role service_role; select credit_close_restart_orphans('${NOW}'); commit;`),
  );
});
