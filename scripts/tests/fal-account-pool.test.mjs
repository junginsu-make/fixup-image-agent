import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610010001 — fal 계정 풀(설계 2026-09-29 §3.3 · 보충 2026-10-01 · S3b).

  칸 잡기는 「켜진·막히지 않은·쉬지 않는 계정 중 남은 칸이 가장 큰 것」이고, 진행 중은 30분 창 안의 끝나지 않은
  요청이다. 키 바꾸기·지우기는 진행 중이 있으면 거절한다. 관리자 변경은 모두 `credit_admin_events` 에 남고
  암호문은 기록에 없다.
*/
const MIGRATION = '202610010001_fal_account_pool.sql';
const ADMIN = '93000000-0000-4000-8000-000000000001';
const ADMIN2 = '93000000-0000-4000-8000-000000000002';
const MEMBER = '93000000-0000-4000-8000-000000000003';
const A = 'a1000000-0000-4000-8000-000000000001';
const B = 'a1000000-0000-4000-8000-000000000002';
const C = 'a1000000-0000-4000-8000-000000000003';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

const add = (id, name, limit = 20, actor = ADMIN) =>
  db.sql(`select fal_account_add('${actor}','${id}','${name}','Y2lwaGVy','aXY=','dGFn','${id.slice(-4)}',${limit});`);
const claim = async (exclude = []) => {
  const out = await db.sql(`select coalesce(json_agg(c), '[]') from fal_account_claim('fal-ai/x', array[${exclude.map((x) => `'${x}'`).join(',')}]::uuid[]) c;`);
  return JSON.parse(out)[0] ?? null;
};
const open = (id) => db.sql(`select fal_account_open_count('${id}');`).then(Number);

before(async () => {
  db = await testPostgres();
  await db.migrate([MIGRATION]);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${ADMIN}','a1@example.invalid',now()),('${ADMIN2}','a2@example.invalid',now()),('${MEMBER}','m@example.invalid',now());
    update profiles set status='active',role='admin' where id in ('${ADMIN}','${ADMIN2}');
    update profiles set status='active' where id='${MEMBER}';`);
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.sql(`delete from fal_requests; delete from fal_accounts; delete from credit_admin_events where action like 'fal_account_%';`);
});

test('both admins can add; a member cannot', async () => {
  await add(A, 'fal-1 (ai.dev 계정)', 20, ADMIN);
  await add(B, 'fal-2', 20, ADMIN2);
  await assert.rejects(add(C, 'fal-3', 20, MEMBER), /credit_admin_required/);
  assert.equal(await db.sql(`select count(*) from fal_accounts;`), '2');
});

test('the audit row has the name and last 4, never the ciphertext', async () => {
  await add(A, 'fal-1');
  const row = await json(`select to_jsonb(e) from (select action, input from credit_admin_events where action='fal_account_add') e;`);
  assert.equal(row.action, 'fal_account_add');
  assert.deepEqual(row.input, { id: A, name: 'fal-1', last4: '0001', limit: 20 });
  assert.doesNotMatch(JSON.stringify(row), /Y2lwaGVy|aXY=|dGFn/);
});

test('live names are unique, case and spaces ignored', async () => {
  await add(A, 'fal-1');
  await assert.rejects(add(B, ' FAL-1 '), /fal_accounts_name_live/);
});

test('claim picks the account with the most free slots and counts it', async () => {
  await add(A, 'small', 2);
  await add(B, 'big', 5);
  assert.equal((await claim()).account_id, B);   // 5 free vs 2
  assert.equal((await claim()).account_id, B);   // 4 vs 2
  assert.equal((await claim()).account_id, B);   // 3 vs 2
  assert.equal((await claim()).account_id, A);   // 2 vs 2 → older first
  assert.equal(await open(B), 3);
  assert.equal(await open(A), 1);
});

test('claim returns nothing when every account is full', async () => {
  await add(A, 'one', 1);
  assert.ok(await claim());
  assert.equal(await claim(), null);
});

/*
  독립 리뷰(opus) fix round 1 — Important 2.

  `fal_account_claim` 의 짧은 잠금(advisory lock)을 지우면, 여러 요청이 동시에 「남은 칸」을 같은 값으로
  읽고 전부 통과해 한도를 넘어 배정한다(리뷰어 확인: 잠금 없이 한도 3 짜리 계정 둘에 24개를 동시에 보내면
  17/7 로 벌어졌다). 하네스는 `db.sql` 호출마다 새 psql 프로세스(새 세션)를 띄우므로, `claim()` 을
  `Promise.all` 로 묶으면 실제로 여러 트랜잭션이 동시에 들어온다.
*/
test('claim serializes concurrent racers so a limit of 3 never over-allocates', async () => {
  await add(A, 'solo', 3);
  const attempts = await Promise.all(Array.from({ length: 20 }, () => claim()));
  const granted = attempts.filter(Boolean);
  assert.equal(granted.length, 3);
  assert.equal(await open(A), 3);
});

test('claim skips excluded, disabled, cooling, locked, invalid and undecryptable accounts', async () => {
  await add(A, 'a'); await add(B, 'b'); await add(C, 'c');
  assert.notEqual((await claim([A, B])).account_id, A);
  await db.sql(`update fal_accounts set enabled=false where id='${A}';
                update fal_accounts set cooldown_until=now()+interval '1 minute' where id='${B}';`);
  assert.equal((await claim()).account_id, C);
  for (const state of ['locked', 'invalid', 'decrypt_failed']) {
    await db.sql(`update fal_accounts set state='${state}' where id='${C}';`);
    assert.equal(await claim(), null, state);
  }
});

test('release gives the slot back; finish frees it; old open rows stop counting after 30 minutes', async () => {
  await add(A, 'a', 1);
  const first = await claim();
  await db.sql(`select fal_request_release(${first.slot_id});`);
  assert.equal(await open(A), 0);
  const second = await claim();
  await db.sql(`select fal_request_bind(${second.slot_id}, 'req-1');`);
  assert.equal(await claim(), null);
  await db.sql(`select fal_request_finish('req-1');`);
  assert.equal(await open(A), 0);
  const third = await claim();
  await db.sql(`select fal_request_bind(${third.slot_id}, 'req-2');
                update fal_requests set claimed_at = now() - interval '31 minutes' where fal_request_id='req-2';`);
  assert.equal(await open(A), 0);
});

test('release does not delete a slot that already has a request id', async () => {
  await add(A, 'a');
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-9'); select fal_request_release(${slot.slot_id});`);
  assert.equal(await db.sql(`select count(*) from fal_requests where fal_request_id='req-9';`), '1');
});

test('mark is true only on the first change; rate_limited cools for 60 seconds and bind clears it', async () => {
  await add(A, 'a');
  assert.equal(await db.sql(`select fal_account_mark('${A}','locked','User is locked');`), 't');
  assert.equal(await db.sql(`select fal_account_mark('${A}','locked','again');`), 'f');
  const locked = await json(`select to_jsonb(a) from (select state, last_error_kind, last_error_detail from fal_accounts where id='${A}') a;`);
  assert.deepEqual(locked, { state: 'locked', last_error_kind: 'locked', last_error_detail: 'again' });

  await db.sql(`update fal_accounts set state='ok' where id='${A}';`);
  await db.sql(`select fal_account_mark('${A}','rate_limited','429');`);
  const cool = await db.sql(`select extract(epoch from cooldown_until - now())::int from fal_accounts where id='${A}';`);
  assert.ok(Number(cool) > 50 && Number(cool) <= 60, cool);
  assert.equal(await claim(), null);
  await db.sql(`update fal_accounts set cooldown_until = now() - interval '1 second' where id='${A}';`);
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-3');`);
  assert.equal(await db.sql(`select state || ':' || coalesce(cooldown_until::text,'none') from fal_accounts where id='${A}';`), 'ok:none');
});

/*
  독립 리뷰(opus) fix round 1 — Important 1.

  막혀서(locked/invalid/decrypt_failed) 뺀 계정에 그 뒤 하나의 429 만 와도 `rate_limited` 로 덮어써지면,
  60초 뒤 다시 배정되고(여전히 잠겨 있을 계정인데) 다음 403 에서 메일이 또 나간다. 관리자가 고치거나
  「다시 확인」할 때까지는 상태를 지켜야 한다.
*/
test('a locked account is not downgraded to rate_limited by a later 429', async () => {
  await add(A, 'a');
  assert.equal(await db.sql(`select fal_account_mark('${A}','locked','User is locked');`), 't');
  assert.equal(await db.sql(`select fal_account_mark('${A}','rate_limited','429');`), 'f');
  assert.equal(await db.sql(`select state from fal_accounts where id='${A}';`), 'locked');
  assert.equal(await claim(), null);
});

test('an unknown failure kind is refused', async () => {
  await add(A, 'a');
  await assert.rejects(db.sql(`select fal_account_mark('${A}','mystery','x');`), /unknown kind/);
});

test('update writes enable/disable/update audit names', async () => {
  await add(A, 'a');
  await db.sql(`select fal_account_update('${ADMIN}','${A}','a',20,false);
                select fal_account_update('${ADMIN2}','${A}','a',20,true);
                select fal_account_update('${ADMIN}','${A}','a2',30,true);`);
  const actions = await json(`select json_agg(action order by created_at, action) from credit_admin_events where action like 'fal_account_%' and action <> 'fal_account_add';`);
  assert.deepEqual(actions.sort(), ['fal_account_disable', 'fal_account_enable', 'fal_account_update']);
  await assert.rejects(db.sql(`select fal_account_update('${ADMIN}','${A}','a',0,true);`), /concurrency_limit/);
  await assert.rejects(db.sql(`select fal_account_update('${ADMIN}','${A}','a',201,true);`), /concurrency_limit/);
});

test('key change and delete are refused while a request is in flight, then allowed', async () => {
  await add(A, 'a');
  const slot = await claim();
  await db.sql(`select fal_request_bind(${slot.slot_id}, 'req-4');`);
  await assert.rejects(db.sql(`select fal_account_set_key('${ADMIN}','${A}','bmV3','aXY=','dGFn','9999');`), /fal_account_in_flight/);
  await assert.rejects(db.sql(`select fal_account_delete('${ADMIN}','${A}');`), /fal_account_in_flight/);
  await db.sql(`select fal_request_finish('req-4');`);
  await db.sql(`select fal_account_set_key('${ADMIN}','${A}','bmV3','aXY=','dGFn','9999');`);
  assert.equal(await db.sql(`select key_last4 || ':' || state from fal_accounts where id='${A}';`), '9999:ok');
  await db.sql(`select fal_account_delete('${ADMIN}','${A}');`);
  const gone = await json(`select to_jsonb(a) from (select enabled, key_ciphertext, deleted_at is not null as deleted from fal_accounts where id='${A}') a;`);
  assert.deepEqual(gone, { enabled: false, key_ciphertext: null, deleted: true });
  assert.equal(await db.sql(`select count(*) from fal_account_admin_list();`), '0');
  // 지운 이름은 다시 쓸 수 있다.
  await add(B, 'a');
});

test('recheck sets ok or invalid and is recorded', async () => {
  await add(A, 'a');
  await db.sql(`select fal_account_mark('${A}','locked','x'); select fal_account_recheck('${ADMIN}','${A}',true,null);`);
  assert.equal(await db.sql(`select state from fal_accounts where id='${A}';`), 'ok');
  await db.sql(`select fal_account_recheck('${ADMIN}','${A}',false,'invalid key credentials');`);
  assert.equal(await db.sql(`select state || ':' || last_error_detail from fal_accounts where id='${A}';`), 'invalid:invalid key credentials');
  assert.equal(await db.sql(`select count(*) from credit_admin_events where action='fal_account_check';`), '2');
});

test('the admin list and history never carry ciphertext', async () => {
  await add(A, 'a');
  const list = await json(`select json_agg(l) from fal_account_admin_list() l;`);
  assert.equal(list[0].key_last4, '0001');
  assert.equal(list[0].in_flight, 0);
  assert.equal('key_ciphertext' in list[0], false);
  const history = await json(`select json_agg(h) from fal_account_admin_events(20) h;`);
  assert.equal(history[0].actor_email, 'a1@example.invalid');
  assert.doesNotMatch(JSON.stringify(history), /Y2lwaGVy/);
});

test('members cannot read the tables or call any function', async () => {
  for (const table of ['fal_accounts', 'fal_requests']) {
    assert.equal(await db.sql(`select has_table_privilege('anon','public.${table}','select');`), 'f');
    assert.equal(await db.sql(`select has_table_privilege('authenticated','public.${table}','select');`), 'f');
    assert.equal(await db.sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass;`), 't');
  }
  for (const fn of ['fal_account_claim(text,uuid[])', 'fal_account_add(uuid,uuid,text,text,text,text,text,integer)', 'fal_account_admin_list()']) {
    assert.equal(await db.sql(`select has_function_privilege('authenticated','public.${fn}','execute');`), 'f', fn);
    assert.equal(await db.sql(`select has_function_privilege('anon','public.${fn}','execute');`), 'f', fn);
    assert.equal(await db.sql(`select has_function_privilege('service_role','public.${fn}','execute');`), 't', fn);
  }
});

test('running the file twice is safe', async () => {
  await db.sql(await readFile(new URL(`../../supabase/migrations/${MIGRATION}`, import.meta.url), 'utf8'));
  assert.equal(await db.sql(`select count(*) from pg_proc where proname='fal_account_claim';`), '1');
});
