import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300001 — AI 사용 통제 C1(설계 2026-09-30 §3.2·§5).

  크레딧이 없거나 운영자가 멈췄으면 AI 예약이 거절된다. 예외는 둘뿐이다 —
  AI 없는 광고 내보내기(`ad:export`)와, 크레딧 없는 회원의 도우미 물음 10회.
  정적 시험(`ai-usage-control-migration.test.ts`)은 글을 읽고, 이 파일은 실제로 돌린다.
*/
const MIGRATION = '202609300001_ai_usage_control.sql';
const admin = '90000000-0000-4000-8000-000000000001';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 회원 한 명. 가입 무료 크레딧이 없으므로(D4) 안 주면 0 이다. */
async function member(credits = 0) {
  const user = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.invalid',now());
    update profiles set status='active' where id='${user}';`);
  if (credits > 0) {
    await db.sql(`select credit_admin_grant('${user}','bonus',${credits},0,now()+interval '3 months','g-${randomUUID()}','fixture','${admin}');`);
  }
  return user;
}

/** 예약 한 번. 한도 값은 앱처럼 넘긴다(CS 60, `lib/membership/hourly-limit.ts`). */
function reserve(user, { operation = 'pdp_analyze', outputs = [], resource = 'test:free', request = randomUUID(), limit = 60 } = {}) {
  return json(`select credit_reserve('${user}','${request}','${operation}',array[${outputs.join(',')}]::integer[],'${resource}',${limit});`);
}
const setPause = (value) => db.sql(`insert into app_settings(key,value) values('ai_paused','${value}')
  on conflict (key) do update set value=excluded.value, updated_at=now();`);
const clearPause = () => db.sql(`delete from app_settings where key='ai_paused';`);

/** 도우미 물음을 n 번 잡는다. 모두 통과해야 한다. */
async function askTimes(user, n) {
  const requests = [];
  for (let i = 0; i < n; i += 1) {
    const request = randomUUID();
    const result = await reserve(user, { operation: 'cs_ask', resource: 'cs:ask', request });
    assert.equal(result.allowed, true, `${i + 1}번째 물음: ${JSON.stringify(result)}`);
    requests.push(request);
  }
  return requests;
}
/** 앱이 닫듯 닫는다. 실패 사유가 곧 셈 규칙의 입력이다. */
const close = (user, request, code) =>
  db.sql(`select credit_finalize('${user}','${request}',array[]::integer[],true,'${code}');`);

before(async () => {
  db = await testPostgres();
  // 새 파일은 커밋 전이라 git 목록에 없을 수 있다. 이름으로 함께 깐다.
  await db.migrate([MIGRATION]);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
});
after(async () => { await db?.close(); });

test('credit_reserve is still one function with the same arguments', async () => {
  assert.equal(await db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='credit_reserve';`), '1');
  assert.equal(await db.sql(`select to_regprocedure('public.credit_reserve(uuid,uuid,text,integer[],text,integer)') is not null;`), 't');
});

test('the switch stops every AI reservation, administrators included', async () => {
  const rich = await member(100);
  await db.sql(`select credit_admin_grant('${admin}','bonus',1000,0,now()+interval '3 months','g-${randomUUID()}','fixture','${admin}');`);
  await setPause('1');
  try {
    for (const [user, operation, outputs, resource] of [
      [rich, 'poster_image', [1], 'poster:p1'],
      [rich, 'cs_ask', [], 'cs:ask'],
      [admin, 'pdp_analyze', [], 'pdp:analyze'],
    ]) {
      const result = await reserve(user, { operation, outputs, resource });
      assert.equal(result.allowed, false, JSON.stringify(result));
      assert.equal(result.reason, 'ai_paused');
    }
  } finally { await clearPause(); }
});

test('only the value 1 pauses; no row or 0 does not', async () => {
  const rich = await member(10);
  assert.equal((await reserve(rich)).allowed, true);
  await setPause('0');
  try { assert.equal((await reserve(rich)).allowed, true); } finally { await clearPause(); }
});

test('member checks run before the switch', async () => {
  const gone = await member(10);
  await db.sql(`update profiles set status='suspended' where id='${gone}';`);
  await setPause('1');
  try { assert.equal((await reserve(gone)).reason, 'inactive_member'); } finally { await clearPause(); }
});

test('the switch comes before duplicate detection', async () => {
  const rich = await member(10);
  const request = randomUUID();
  assert.equal((await reserve(rich, { request })).allowed, true);
  await setPause('1');
  try { assert.equal((await reserve(rich, { request })).reason, 'ai_paused'); } finally { await clearPause(); }
  assert.equal((await reserve(rich, { request })).reason, 'duplicate_request');
});

test('AI-free ad export passes the switch and an empty wallet; a cutout does not', async () => {
  const empty = await member(0);
  await setPause('1');
  try {
    assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export' })).allowed, true);
    assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export:cutout' })).reason, 'ai_paused');
  } finally { await clearPause(); }
  assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export' })).allowed, true);
  assert.equal((await reserve(empty, { operation: 'ad_export', resource: 'ad:export:cutout' })).reason, 'credits_required');
});

test('an empty wallet refuses free AI work', async () => {
  const empty = await member(0);
  for (const [operation, resource] of [['pdp_analyze', 'pdp:analyze'], ['sns_image', 'sns:p1:plan'], ['poster_image', 'easy:decide']]) {
    const result = await reserve(empty, { operation, resource });
    assert.equal(result.reason, 'credits_required', `${operation}: ${JSON.stringify(result)}`);
  }
});

test('an empty wallet refuses image work with the same reason, not quota_exceeded', async () => {
  const empty = await member(0);
  const result = await reserve(empty, { operation: 'poster_image', outputs: [1], resource: 'poster:p1' });
  assert.equal(result.reason, 'credits_required');
});

test('the app path (dispatch) carries the new reason', async () => {
  const empty = await member(0);
  const result = await json(`select credit_reserve_dispatch('${empty}','${randomUUID()}','pdp_analyze',0,10,array[]::integer[],'pdp:analyze');`);
  assert.equal(result.reason, 'credits_required');
});

test('duplicate detection comes before the empty wallet', async () => {
  const empty = await member(0);
  const request = randomUUID();
  assert.equal((await reserve(empty, { operation: 'cs_ask', resource: 'cs:ask', request })).allowed, true);
  assert.equal((await reserve(empty, { request })).reason, 'duplicate_request');
});

test('credits held by a running image job still count as balance', async () => {
  const one = await member(1);
  assert.equal((await reserve(one, { operation: 'poster_image', outputs: [1], resource: 'poster:p1' })).allowed, true);
  const wallet = await json(`select credit_wallet_state('${one}');`);
  assert.equal(wallet.available, 0);
  assert.equal(wallet.balance, 1);
  assert.equal((await reserve(one, { operation: 'cs_ask', resource: 'cs:ask' })).allowed, true);
  assert.equal((await reserve(one, { operation: 'sns_image', resource: 'sns:p1:caption' })).allowed, true);
});

test('expired credits are no balance', async () => {
  const lapsed = await member(5);
  await db.sql(`update credit_grants set granted_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id='${lapsed}';`);
  assert.equal((await reserve(lapsed)).reason, 'credits_required');
});

test('without credits the assistant answers ten times in a lifetime, not per hour', async () => {
  const empty = await member(0);
  await askTimes(empty, 10);
  // 한 시간 창 밖으로 밀어도 센다 — 「가입 후 통틀어」다.
  await db.sql(`update generation_events set created_at=now()-interval '2 days' where user_id='${empty}';`);
  assert.equal((await reserve(empty, { operation: 'cs_ask', resource: 'cs:ask' })).reason, 'credits_required');
});

test('a failed answer counts; a malformed question and exempt provider failures do not', async () => {
  const empty = await member(0);
  const asked = await askTimes(empty, 10);
  const next = () => reserve(empty, { operation: 'cs_ask', resource: 'cs:ask' });

  await close(empty, asked[0], 'cs_failed');
  assert.equal((await next()).reason, 'credits_required', 'cs_failed 는 모델 값이 나갔을 수 있어 센다');

  await close(empty, asked[1], 'invalid_request');
  assert.equal((await next()).allowed, true, '모델을 부르기 전 본문 오류는 안 센다');
  assert.equal((await next()).reason, 'credits_required');

  await close(empty, asked[2], 'AI_KEY_MISSING');
  assert.equal((await next()).allowed, true, '시간당 면제 목록의 실패도 안 센다');
  assert.equal((await next()).reason, 'credits_required');
});

test('with at least one credit the ten-question rule does not apply', async () => {
  const one = await member(1);
  await askTimes(one, 12);
});

test('the assistant hourly limit now applies on the ledger path', async () => {
  const rich = await member(10);
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await reserve(rich, { operation: 'cs_ask', resource: 'cs:ask', limit: 2 })).allowed, true);
  }
  assert.equal((await reserve(rich, { operation: 'cs_ask', resource: 'cs:ask', limit: 2 })).reason, 'analysis_rate_limit');
});

test('a member session still cannot call it', async () => {
  const empty = await member(0);
  await assert.rejects(
    db.sql(`begin; set local role authenticated; select credit_reserve('${empty}','${randomUUID()}','cs_ask',array[]::integer[],'cs:ask',60); commit;`),
    /permission denied for function credit_reserve/,
  );
});
