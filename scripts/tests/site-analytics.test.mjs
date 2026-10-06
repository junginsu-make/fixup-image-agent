import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610060001 — 방문 통계 표와 함수(계획 2026-10-06 site-analytics, 1단계).

  섞어 쓰기: 모두를 쿠키 없이 하루 단위(visitor)로 세고, 동의한 브라우저만 쿠키 번호(cookie_key)로
  여러 날을 잇는다. IP·브라우저 정보·쿠키 원래 값은 남지 않는다. 날짜는 **한국 시각**이다.
*/
const MIGRATIONS = ['202610060001_site_analytics.sql'];
const MEMBER = '93000000-0000-4000-8000-000000000001';
const C1 = '5b1f0c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f';
const C2 = '6c2a1d2f-3b4c-4d6e-9fa0-1b2c3d4e5f60';
let db;

const q = (value) => (value ? `'${value}'` : 'null');
const record = (now, { ip = '203.0.113.7', ua = 'UA-A', user = null, path = '/', entry = false, cookie = null } = {}) =>
  db.sql(`select analytics_record('${ip}', '${ua}', ${q(user)}, '${path}',
    null, null, null, null, 'desktop', 'chrome', ${entry}, ${q(cookie)}, '${now}'::timestamptz);`);
const visitors = async () => Number(await db.sql('select count(distinct visitor) from analytics_page_views;'));
const cookieKeys = async () => Number(await db.sql('select count(distinct cookie_key) from analytics_page_views;'));

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${MEMBER}','m@example.invalid',now());
    update profiles set status='active' where id='${MEMBER}';`);
});
beforeEach(async () => { await db.sql('truncate analytics_page_views, analytics_salts;'); });
after(async () => { await db?.close(); });

test('stores one-way values, never the IP, the user agent or the raw cookie', async () => {
  await record('2026-10-06 10:00:00+09', { ip: '203.0.113.7', ua: 'Mozilla/5.0 UNIQUE-UA', cookie: C1 });
  const row = await db.sql('select row_to_json(t)::text from analytics_page_views t;');
  assert.ok(!row.includes('203.0.113.7'), 'IP 가 남았다');
  assert.ok(!row.includes('UNIQUE-UA'), '브라우저 정보가 남았다');
  assert.ok(!row.includes(C1), '쿠키 원래 값이 남았다');
  assert.match(await db.sql('select visitor from analytics_page_views;'), /^[0-9a-f]{64}$/);
  assert.match(await db.sql('select cookie_key from analytics_page_views;'), /^[0-9a-f]{64}$/);
});

test('same IP and browser on the same Korean day is one visitor, logged in or not', async () => {
  await record('2026-10-06 10:00:00+09');
  await record('2026-10-06 10:05:00+09', { user: MEMBER });
  assert.equal(await visitors(), 1);
  assert.equal(await db.sql(`select count(*) from analytics_page_views where user_id='${MEMBER}';`), '1');
});

test('the day follows the Korean clock, not UTC', async () => {
  // 한국 08:50 과 09:10 은 UTC 로는 다른 날이지만 한국으로는 같은 날이다.
  await record('2026-10-06 08:50:00+09');
  await record('2026-10-06 09:10:00+09');
  assert.equal(await visitors(), 1);
});

test('a new Korean day gives a new visitor value and drops the old salt', async () => {
  await record('2026-10-06 23:50:00+09');
  await record('2026-10-07 00:10:00+09');
  assert.equal(await visitors(), 2);
  assert.equal(await db.sql(`select string_agg(day::text, ',') from analytics_salts;`), '2026-10-07');
});

test('the cookie ties days together while the daily value does not', async () => {
  await record('2026-10-02 20:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  assert.equal(await visitors(), 2);
  assert.equal(await cookieKeys(), 1);
});

test('consent links the earlier rows of the same visitor today, and nobody else', async () => {
  await record('2026-10-05 15:00:00+09', { ip: '203.0.113.7' });          // 어제 — 이어 붙이지 않는다
  await record('2026-10-06 10:00:00+09', { ip: '203.0.113.7', entry: true }); // 오늘 첫 화면 — 붙인다
  await record('2026-10-06 10:00:30+09', { ip: '198.51.100.9' });           // 다른 사람 — 안 붙인다
  const linked = await db.sql(`select analytics_link_cookie('${C1}', '203.0.113.7', 'UA-A', '2026-10-06 10:02:00+09'::timestamptz);`);
  assert.equal(linked, '1');
  assert.equal(await db.sql('select count(*) from analytics_page_views where cookie_key is not null;'), '1');
  assert.equal(await db.sql('select bool_and(entry) from analytics_page_views where cookie_key is not null;'), 't');
});

test('linking without a cookie is refused', async () => {
  await assert.rejects(() => db.sql(`select analytics_link_cookie(null, '1.1.1.1', 'UA-A');`), /cookie required/);
});

test('refusing forgets the cookie on every day and leaves others alone', async () => {
  await record('2026-10-02 20:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { cookie: C1 });
  await record('2026-10-06 10:00:00+09', { ip: '198.51.100.9', cookie: C2 });
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

test('members and visitors cannot read the tables or call any function', async () => {
  const fns = [
    'analytics_record(text,text,uuid,text,text,text,text,text,text,text,boolean,text,timestamptz)',
    'analytics_link_cookie(text,text,text,timestamptz)',
    'analytics_forget(text)',
    'analytics_prune(integer,timestamptz)',
    'analytics_visitor_hash(text,text,timestamptz)',
    'analytics_cookie_key(text)',
  ];
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['analytics_page_views', 'analytics_salts']) {
      assert.equal(await db.sql(`select has_table_privilege('${role}', 'public.${table}', 'select');`), 'f');
    }
    for (const fn of fns) {
      assert.equal(await db.sql(`select has_function_privilege('${role}', 'public.${fn}', 'execute');`), 'f', `${role} ${fn}`);
    }
  }
});
