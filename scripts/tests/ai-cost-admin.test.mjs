import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300003 — 관리자 AI 비용 보고와 「AI 전체 멈춤」 스위치(설계 2026-09-30 §3.3·§3.4 · C4).

  보고는 **한국 시각**으로 자른다(한국 0시~9시 호출이 「오늘」). 스위치는 정확히 '1'/'0' 을 쓰고,
  바뀔 때마다 `credit_admin_events` 에 한 줄을 남기며, 실제로 `credit_reserve` 를 멈춘다.
*/
const MIGRATIONS = ['202609300002_ai_cost_events.sql', '202609300003_ai_cost_admin.sql'];
const ADMIN = '92000000-0000-4000-8000-000000000001';
const MEMBER = '92000000-0000-4000-8000-000000000002';
let db;
const json = async (q) => JSON.parse(await db.sql(q));
const report = (now, days = 30) => json(`select admin_ai_cost_report(${days}, '${now}'::timestamptz);`);

before(async () => {
  db = await testPostgres();
  await db.migrate(MIGRATIONS);
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${ADMIN}','a@example.invalid',now()),('${MEMBER}','m@example.invalid',now());
    update profiles set status='active',role='admin' where id='${ADMIN}';
    update profiles set status='active' where id='${MEMBER}';
    select credit_admin_grant('${MEMBER}','bonus',100,0,now()+interval '3 months','g-${MEMBER}','fixture','${ADMIN}');
    insert into ai_cost_events(created_at,operation,provider,model,usd,usd_basis) values
      ('2026-09-30 00:30:00+09','cs:ask','anthropic','claude-sonnet-5',1,'tokens'),
      ('2026-09-29 23:30:00+09','sns:plan','openai','gpt-5.6-sol',2,'tokens'),
      ('2026-09-01 00:10:00+09','poster','fal','nano-banana-pro',4,'image_unit'),
      ('2026-08-31 23:50:00+09','poster','fal','nano-banana-pro',8,'image_unit');`);
});
after(async () => { await db?.close(); });

test('today follows the Korean clock, not UTC', async () => {
  const r = await report('2026-09-30 08:00:00+09');
  assert.equal(r.today_usd, 1);             // UTC 로 자르면 3 — 한국 9/29 23:30 도 「오늘」이 된다
  assert.equal(r.month_usd, 1 + 2 + 4);     // 한국 8/31 23:50 은 지난달
  assert.equal(r.window_usd, 7);            // 30일 창은 한국 9/1~9/30
  assert.equal(r.daily.length, 30);
  assert.deepEqual(r.daily.at(-1), { day: '2026-09-30', usd: 1, calls: 1 });
  assert.deepEqual(r.daily.at(-2), { day: '2026-09-29', usd: 2, calls: 1 });
  assert.equal(r.daily[0].day, '2026-09-01');
});

test('breaks down by provider and by operation over the window', async () => {
  const r = await report('2026-09-30 08:00:00+09');
  assert.deepEqual(r.by_provider.map((x) => [x.key, x.usd, x.calls]), [['fal', 4, 1], ['openai', 2, 1], ['anthropic', 1, 1]]);
  assert.deepEqual(r.by_operation.map((x) => [x.key, x.usd]), [['poster', 4], ['sns:plan', 2], ['cs:ask', 1]]);
});

test('rows after the report time are not counted', async () => {
  const r = await report('2026-09-29 12:00:00+09');
  assert.equal(r.today_usd, 0);
  assert.equal(r.window_usd, 12);           // 한국 8/31~9/29 창: 8 + 4
});

test('a short window still gives a full calendar and zeros', async () => {
  const r = await report('2026-10-20 08:00:00+09', 7);
  assert.equal(r.today_usd, 0);
  assert.equal(r.daily.length, 7);
  assert.deepEqual(r.by_provider, []);
});

test('the switch writes exactly 1 or 0 and leaves one audit row per change', async () => {
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`), { paused: true, changed: true });
  assert.equal(await db.sql(`select value from app_settings where key='ai_paused';`), '1');
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`), { paused: true, changed: false });
  assert.deepEqual(await json(`select admin_set_ai_paused('${ADMIN}', false, '시험');`), { paused: false, changed: true });
  assert.equal(await db.sql(`select value from app_settings where key='ai_paused';`), '0');
  const events = await json(`select jsonb_agg(jsonb_build_object('action',action,'targets',target_ids)) from credit_admin_events where actor_id='${ADMIN}' and action in ('ai_pause','ai_resume');`);
  assert.deepEqual(events.map((e) => e.action).sort(), ['ai_pause', 'ai_resume']);
  assert.ok(events.every((e) => Array.isArray(e.targets) && e.targets.length === 0));
});

test('the switch really stops credit_reserve', async () => {
  await json(`select admin_set_ai_paused('${ADMIN}', true, '시험');`);
  const refused = await json(`select credit_reserve('${MEMBER}', gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'pdp:analyze', 60);`);
  assert.equal(refused.reason, 'ai_paused');
  await json(`select admin_set_ai_paused('${ADMIN}', false, '시험');`);
  const allowed = await json(`select credit_reserve('${MEMBER}', gen_random_uuid(), 'pdp_analyze', array[]::integer[], 'pdp:analyze', 60);`);
  assert.equal(allowed.allowed, true, JSON.stringify(allowed));
});

test('only an active admin can flip the switch, with a reason', async () => {
  await assert.rejects(db.sql(`select admin_set_ai_paused('${MEMBER}', true, '시험');`), /admin_required/);
  await assert.rejects(db.sql(`select admin_set_ai_paused('${ADMIN}', true, '  ');`), /reason_required/);
  assert.equal(await db.sql(`select has_function_privilege('authenticated','public.admin_set_ai_paused(uuid,boolean,text)','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('anon','public.admin_ai_cost_report(integer,timestamptz)','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('service_role','public.admin_ai_cost_report(integer,timestamptz)','execute');`), 't');
});
