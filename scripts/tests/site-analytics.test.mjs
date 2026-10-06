import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610060001 — 방문 통계 표와 함수(계획 2026-10-06 site-analytics, 1단계 + 보안 검토 반영).

  섞어 쓰기: 모두를 쿠키 없이 하루 단위 방문자 값(visitor)으로 세고, 동의한 브라우저만 쿠키 번호(cookie_key)로
  여러 날을 잇는다. 방문자 값은 **앱이 서버 메모리 열쇠로 만들어 넘긴다**(lib/analytics/visitor.ts 시험).
  DB 는 IP·브라우저 정보를 받지도 않는다. 날짜는 **한국 시각**이다.
*/
const MIGRATIONS = ['202610060001_site_analytics.sql'];
const MEMBER = '93000000-0000-4000-8000-000000000001';
const OTHER_MEMBER = '93000000-0000-4000-8000-000000000002';
const C1 = '5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const C2 = '6c2a1d2f-3b4c-4d6e-9fa0-1b2c3d4e5f60';
const V1 = 'a'.repeat(64);
const V2 = 'b'.repeat(64);
let db;

const q = (value) => (value ? `'${value}'` : 'null');
const record = (now, { visitor = V1, user = null, path = '/', entry = false, cookie = null } = {}) =>
  db.sql(`select analytics_record(${q(visitor)}, ${q(user)}, '${path}',
    null, null, null, null, 'desktop', 'chrome', ${entry}, ${q(cookie)}, '${now}'::timestamptz);`);
const link = (cookie, visitor, user, now) =>
  db.sql(`select analytics_link_cookie(${q(cookie)}, ${q(visitor)}, ${q(user)}, '${now}'::timestamptz);`);
const visitors = async () => Number(await db.sql('select count(distinct visitor) from analytics_page_views;'));
const cookieKeys = async () => Number(await db.sql('select count(distinct cookie_key) from analytics_page_views;'));

before(async () => {
  db = await testPostgres();
  // 기계 시간대와 상관없이 세션을 UTC 로 고정한다(한국 날짜 자르기가 빠지면 이 시험이 잡도록).
  await db.sql("alter database postgres set timezone to 'UTC';");
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${MEMBER}','m@example.invalid',now()), ('${OTHER_MEMBER}','o@example.invalid',now());
    update profiles set status='active' where id in ('${MEMBER}','${OTHER_MEMBER}');`);
});
beforeEach(async () => { await db.sql('truncate analytics_page_views;'); });
after(async () => { await db?.close(); });

test('stores the visitor value and a one-way cookie key, never the raw cookie', async () => {
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  const row = await db.sql('select row_to_json(t)::text from analytics_page_views t;');
  assert.ok(!row.includes(C1), '쿠키 원래 값이 남았다');
  assert.equal(await db.sql('select visitor from analytics_page_views;'), V1);
  assert.match(await db.sql('select cookie_key from analytics_page_views;'), /^[0-9a-f]{64}$/);
});

test('a visitor value that is not 64 lowercase hex is refused', async () => {
  for (const bad of [null, '', 'abc', 'A'.repeat(64), `${'a'.repeat(63)}g`]) {
    await assert.rejects(() => record('2026-10-06 10:00:00+09', { visitor: bad }), /visitor must be 64 hex/);
  }
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '0');
});

test('the same visitor value logged in or not is one visitor', async () => {
  await record('2026-10-06 10:00:00+09');
  await record('2026-10-06 10:05:00+09', { user: MEMBER });
  assert.equal(await visitors(), 1);
  assert.equal(await db.sql(`select count(*) from analytics_page_views where user_id='${MEMBER}';`), '1');
});

test('the cookie ties days together while the daily value does not', async () => {
  await record('2026-10-02 20:00:00+09', { visitor: V1, cookie: C1 });
  await record('2026-10-06 10:00:00+09', { visitor: V2, cookie: C1 });
  assert.equal(await visitors(), 2);
  assert.equal(await cookieKeys(), 1);
});

test('one visitor is capped at 500 rows per Korean day, and a new day starts again', async () => {
  await db.sql(`do $$ begin
    for i in 1..501 loop
      perform analytics_record('${V1}', null, '/', null, null, null, null, 'desktop', 'chrome', false, null,
        '2026-10-06 10:00:00+09'::timestamptz + (i || ' seconds')::interval);
    end loop;
  end $$;`);
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '500');
  await record('2026-10-06 23:00:00+09', { visitor: V2 });
  assert.equal(await db.sql(`select count(*) from analytics_page_views where visitor='${V2}';`), '1');
  await record('2026-10-07 00:10:00+09');
  assert.equal(await db.sql(`select count(*) from analytics_page_views where visitor='${V1}';`), '501');
});

test("consent links only this visitor's recent anonymous or own rows", async () => {
  await record('2026-10-06 09:20:00+09');                              // 39 분 전 — 안 붙인다
  await record('2026-10-06 09:29:00+09');                              // 30 분 반 전 — 안 붙인다
  await record('2026-10-06 09:55:00+09', { entry: true });             // 익명 — 붙인다
  await record('2026-10-06 09:56:00+09', { user: MEMBER });            // 본인 — 붙인다
  await record('2026-10-06 09:57:00+09', { user: OTHER_MEMBER });      // 다른 회원 — 안 붙인다
  await record('2026-10-06 09:58:00+09', { visitor: V2 });             // 다른 방문자 — 안 붙인다
  await record('2026-10-06 10:05:00+09');                              // 미래 — 안 붙인다
  const linked = await link(C1, V1, MEMBER, '2026-10-06 09:59:30+09');
  assert.equal(linked, '2');
  assert.equal(await db.sql(`select count(*) from analytics_page_views where cookie_key is not null and visitor='${V1}';`), '2');
  assert.equal(await db.sql(`select count(*) from analytics_page_views where cookie_key is not null and user_id='${OTHER_MEMBER}';`), '0');
  assert.equal(await db.sql(`select bool_or(entry) from analytics_page_views where cookie_key is not null;`), 't');
});

test('consent as a guest links only anonymous rows', async () => {
  await record('2026-10-06 09:55:00+09');
  await record('2026-10-06 09:56:00+09', { user: MEMBER });
  assert.equal(await link(C1, V1, null, '2026-10-06 09:59:00+09'), '1');
});

test('linking without a cookie is refused', async () => {
  await assert.rejects(() => link(null, V1, null, '2026-10-06 10:00:00+09'), /cookie required/);
});

test('refusing forgets the cookie on every day and leaves others alone', async () => {
  await record('2026-10-02 20:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { visitor: V2, cookie: C2 });
  assert.equal(await db.sql(`select analytics_forget('${C1}');`), '2');
  assert.equal(await cookieKeys(), 1);
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '3'); // 하루 단위 숫자는 남는다
  assert.equal(await db.sql(`select analytics_forget(null);`), '0');
});

test('an unknown user id is kept as null instead of failing the write', async () => {
  await record('2026-10-06 10:00:00+09', { user: '93000000-0000-4000-8000-0000000000ff' });
  assert.equal(await db.sql('select count(*) from analytics_page_views where user_id is null;'), '1');
});

test('prune deletes only rows older than the keep window and refuses a short window', async () => {
  await record('2025-09-01 10:00:00+09');
  await record('2026-10-01 10:00:00+09');
  assert.equal(await db.sql(`select analytics_prune(365, '2026-10-06 12:00:00+09'::timestamptz);`), '1');
  assert.equal(await db.sql('select count(*) from analytics_page_views;'), '1');
  await assert.rejects(() => db.sql('select analytics_prune(7);'), /keep_days/);
});

test('there are exactly five functions and no salt table', async () => {
  assert.equal(await db.sql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'analytics\\_%';`), '5');
  assert.equal(await db.sql(`select to_regclass('public.analytics_salts') is null;`), 't');
});

test('members and visitors cannot read the table or call any function', async () => {
  const fns = [
    'analytics_record(text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz)',
    'analytics_link_cookie(text,text,uuid,timestamptz)',
    'analytics_forget(text)',
    'analytics_prune(integer,timestamptz)',
    'analytics_cookie_key(text)',
  ];
  for (const role of ['anon', 'authenticated']) {
    assert.equal(await db.sql(`select has_table_privilege('${role}', 'public.analytics_page_views', 'select');`), 'f');
    for (const fn of fns) {
      assert.equal(await db.sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`), 'f', `${role} ${fn}`);
    }
  }
});
