import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610060002 — 방문 분석 보고 둘(계획 2026-10-06 site-analytics, 2단계).
  한국 시각으로 자르고, 관리자는 뺀다(같은 날 로그인 전 방문, 같은 쿠키 번호의 다른 날 방문까지).
  김은 10/2 유튜브 광고로 처음 왔고(동의해서 번호 '1'), 10/6 인스타 광고로 다시 와서 가입했다.
*/
const MIGRATIONS = ['202610060001_site_analytics.sql', '202610060002_site_analytics_report.sql'];
const ADMIN = '94000000-0000-4000-8000-000000000001';
const KIM = '94000000-0000-4000-8000-000000000002';
const LEE = '94000000-0000-4000-8000-000000000003';
const PARK = '94000000-0000-4000-8000-000000000004';
const NOW = '2026-10-06 12:00:00+09';
const V = (c) => c.repeat(64);
let db;
const json = async (q) => JSON.parse(await db.sql(q));
const traffic = (days = 7) => json(`select admin_site_traffic(${days}, '${NOW}'::timestamptz);`);
const people = (days = 7) => json(`select admin_site_people(${days}, '${NOW}'::timestamptz);`);

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${ADMIN}','a@example.invalid',now()),('${KIM}','kim@example.invalid',now()),
      ('${LEE}','lee@example.invalid',now()),('${PARK}','park@example.invalid',now());
    update profiles set status='active', role='admin', created_at='2026-01-01' where id='${ADMIN}';
    update profiles set status='active', created_at='2026-10-06 00:30:00+09', signup_provider='kakao', referrer_input='카페' where id='${KIM}';
    update profiles set status='active', created_at='2026-08-01', signup_provider=null where id='${LEE}';
    update profiles set status='active', created_at='2026-10-04 15:00:00+09' where id='${PARK}';
    insert into analytics_page_views(created_at, visitor, cookie_key, user_id, path, referrer_host, utm_source, utm_campaign, device, browser, entry) values
      -- 관리자: 로그인 전 + 로그인 뒤(같은 visitor), 그리고 다른 날 같은 쿠키 번호 — 셋 다 빠져야 한다
      ('2026-10-06 09:00:00+09', '${V('a')}', '${V('9')}', null,      '/',        null, null, null, 'desktop','chrome', true),
      ('2026-10-06 09:01:00+09', '${V('a')}', '${V('9')}', '${ADMIN}', '/create',  null, null, null, 'desktop','chrome', false),
      ('2026-10-03 21:00:00+09', '${V('8')}', '${V('9')}', null,      '/guide',   null, null, null, 'desktop','chrome', true),
      -- 김: 10/2 유튜브(번호 1) → 10/6 인스타로 다시 와서 가입. 10:00·10:10 한 세션, 11:00 새 세션
      ('2026-10-02 20:00:00+09', '${V('f')}', '${V('1')}', null,      '/',        null, 'youtube', null, 'mobile','kakaotalk', true),
      ('2026-10-06 10:00:00+09', '${V('b')}', '${V('1')}', null,      '/',        null, 'instagram', 'launch', 'mobile','kakaotalk', true),
      ('2026-10-06 10:10:00+09', '${V('b')}', '${V('1')}', '${KIM}',  '/create',  null, null, null, 'mobile','kakaotalk', false),
      ('2026-10-06 11:00:00+09', '${V('b')}', '${V('1')}', '${KIM}',  '/library', null, null, null, 'mobile','kakaotalk', true),
      -- 손님: 한국 0시 30분 — 「오늘」이다(UTC 로는 어제). 동의 안 함
      ('2026-10-06 00:30:00+09', '${V('c')}', null,        null,      '/guide',   'search.naver.com', null, null, 'desktop','chrome', true),
      -- 이: 어제 한국 23:30, 직접 방문. 동의 안 함
      ('2026-10-05 23:30:00+09', '${V('d')}', null,        '${LEE}',  '/',        null, null, null, 'desktop','edge', true),
      -- 창 밖(8일 전)
      ('2026-09-28 10:00:00+09', '${V('e')}', null,        null,      '/',        null, null, null, 'desktop','chrome', true);
    insert into ai_cost_events(created_at, user_id, operation, provider, model, usd, usd_basis, failed) values
      ('2026-10-06 10:20:00+09', '${KIM}',  'poster',  'fal', 'm', 1, 'tokens', false),
      ('2026-10-06 10:21:00+09', '${KIM}',  'poster',  'fal', 'm', 1, 'tokens', true),
      ('2026-10-05 20:00:00+09', '${LEE}',  'sns:plan','openai','m', 1, 'tokens', false),
      ('2026-10-06 09:05:00+09', '${ADMIN}','poster',  'fal', 'm', 1, 'tokens', false);`);
});
after(async () => { await db?.close(); });

test('counts by the Korean day and leaves admins out entirely', async () => {
  const r = await traffic();
  assert.equal(r.days, 7);
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.daily.at(-1), { day: '2026-10-06', visitors: 2, members: 1, views: 4, signups: 1 });
  assert.deepEqual(r.daily.at(-2), { day: '2026-10-05', visitors: 1, members: 1, views: 1, signups: 0 });
  assert.deepEqual(r.daily.at(-3), { day: '2026-10-04', visitors: 0, members: 0, views: 0, signups: 1 });
  assert.deepEqual(r.daily.at(-4), { day: '2026-10-03', visitors: 0, members: 0, views: 0, signups: 0 });
  assert.deepEqual(r.daily.at(-5), { day: '2026-10-02', visitors: 1, members: 0, views: 1, signups: 0 });
  assert.equal(r.today_visitors, 2);
  assert.equal(r.visitor_days, 4);
  assert.equal(r.views, 6);
  assert.equal(r.members, 2);
  assert.equal(r.pages.find((p) => p.key === '/create').views, 1);  // 관리자 /create 빠짐
  assert.equal(r.pages.find((p) => p.key === '/guide').views, 1);   // 관리자 쿠키의 10/3 /guide 빠짐
});

test('splits sessions after 30 quiet minutes', async () => {
  const r = await traffic();
  // b: [10:00,10:10] [11:00], c, d, f → 5 세션, 길이 600·0·0·0·0
  assert.equal(r.sessions, 5);
  assert.equal(r.avg_session_seconds, 120);
  assert.equal(Number(r.avg_views_per_session), 1.2);
});

test('consented browsers are followed across days', async () => {
  const r = await traffic();
  assert.equal(r.known_browsers, 1);       // 번호 '1' (관리자 번호 '9' 는 빠짐)
  assert.equal(r.returning_browsers, 1);   // 번호 '1' 이 10/2 와 10/6 에
  assert.equal(Number(r.consent_rate), 0.5); // 하루 방문자 b·c·d·f 중 b·f
});

test('sources come from the first screen only: utm first, then referrer, else direct', async () => {
  const r = await traffic();
  assert.deepEqual(r.sources.map((s) => [s.key, s.views]).sort(),
    [['(direct)', 2], ['instagram', 1], ['search.naver.com', 1], ['youtube', 1]]);
  assert.deepEqual(r.campaigns.map((s) => s.key), ['launch']);
  assert.deepEqual(r.devices.map((d) => [d.key, d.visitors]).sort(), [['desktop', 2], ['mobile', 2]]);
});

test('people: active members, providers, features without admins', async () => {
  const r = await people();
  assert.equal(r.active_members, 2);
  assert.equal(r.new_members, 1);
  assert.equal(r.with_referral, 1);
  assert.deepEqual(r.by_provider.map((p) => [p.key, p.members]).sort(), [['email', 1], ['kakao', 1]]);
  assert.deepEqual(r.features.map((f) => [f.key, f.calls, f.users, f.failed]), [['poster', 2, 1, 1], ['sns:plan', 1, 1, 0]]);
  assert.equal(r.top_members[0].email, 'kim@example.invalid');
  assert.equal(r.top_members[0].views, 2);
  assert.equal(r.top_members[0].calls, 2);
});

test('a new member is credited to the first touch, days before signup, through the cookie', async () => {
  const r = await people();
  // 김: 같은 날만 보면 instagram 이지만 쿠키로 10/2 youtube 까지 이어진다. 박: 방문 기록 없음.
  assert.deepEqual(r.signup_sources.map((s) => [s.key, s.members]).sort(), [['(unknown)', 1], ['youtube', 1]]);
});

test('an empty window still gives a full calendar and zeros', async () => {
  const r = await json(`select admin_site_traffic(3, '2027-01-10 12:00:00+09'::timestamptz);`);
  assert.equal(r.daily.length, 3);
  assert.equal(r.views, 0);
  assert.equal(r.avg_session_seconds, 0);
  assert.equal(Number(r.consent_rate), 0);
  assert.deepEqual(r.sources, []);
});

test('members and visitors cannot call the reports', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const fn of ['admin_site_traffic', 'admin_site_people']) {
      assert.equal(await db.sql(`select has_function_privilege('${role}', 'public.${fn}(integer,timestamptz)', 'execute');`), 'f');
    }
  }
});
