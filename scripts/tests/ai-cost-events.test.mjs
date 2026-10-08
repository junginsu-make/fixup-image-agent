import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609300002 — AI 호출마다 비용 한 줄(설계 2026-09-30 §3.4 · C3).

  앱은 공급자를 부를 때마다 `ai_cost_record` 를 부른다. 그림(`image_unit`)은 여기서 `model_prices` 로
  값을 매기고, fal 요청 id 가 같으면 한 번만 적는다. 정적 시험(`ai-cost-migration.test.ts`)은 글을 읽고,
  이 파일은 실제로 돌린다.
*/
const MIGRATION = '202609300002_ai_cost_events.sql';
const NANO_BANANA_21_MIGRATION = '202610080002_nano_banana_21_price.sql';
const USER = '90000000-0000-4000-8000-000000000001';
const REQ = '91000000-0000-4000-8000-000000000001';
const SIGNATURE = 'public.ai_cost_record(uuid,uuid,text,text,text,integer,integer,integer,numeric,text,boolean,text)';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

/** 한 줄 쓰기. 인자 순서는 함수 정의 그대로다. */
const record = ({ operation = 'cs:ask', provider = 'anthropic', model = 'claude-sonnet-5', input = 0, output = 0,
  images = 0, usd = 'null', basis = 'tokens', failed = false, fal = null } = {}) =>
  db.sql(`select ai_cost_record('${USER}','${REQ}','${operation}','${provider}','${model}',${input},${output},${images},${usd},'${basis}',${failed},${fal === null ? 'null' : `'${fal}'`});`);
const row = (where) => json(`select to_jsonb(e) from (select usd::float8 usd, usd_basis, images, input_tokens, output_tokens from ai_cost_events where ${where} order by id desc limit 1) e;`);

before(async () => {
  db = await testPostgres();
  // 새 파일은 커밋 전이라 git 목록에 없을 수 있다. 이름으로 함께 깐다.
  await db.migrate([MIGRATION, NANO_BANANA_21_MIGRATION]);
});
after(async () => { await db?.close(); });

test('text rows keep the amount the app computed', async () => {
  await record({ input: 1000, output: 200, usd: 0.004 });
  assert.deepEqual(await row(`operation='cs:ask'`), { usd: 0.004, usd_basis: 'tokens', images: 0, input_tokens: 1000, output_tokens: 200 });
});

test('image rows are priced from model_prices at write time', async () => {
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 2, basis: 'image_unit', fal: 'fal-a' });
  const unit = Number(await db.sql(`select unit_cost_usd from model_prices where model='nano-banana-pro';`));
  assert.deepEqual(await row(`fal_request_id='fal-a'`), { usd: Number((unit * 2).toFixed(6)), usd_basis: 'image_unit', images: 2, input_tokens: 0, output_tokens: 0 });
});

test('speed model nano-banana-2.1 has a price row and is priced from it', async () => {
  assert.equal(Number(await db.sql(`select unit_cost_usd from model_prices where model='nano-banana-2.1';`)), 0.09);
  await record({ provider: 'fal', model: 'nano-banana-2.1', images: 2, basis: 'image_unit', fal: 'fal-d' });
  assert.deepEqual(await row(`fal_request_id='fal-d'`), { usd: 0.18, usd_basis: 'image_unit', images: 2, input_tokens: 0, output_tokens: 0 });
});

test('an unknown image model is priced at the most expensive row and marked estimate', async () => {
  await record({ provider: 'fal', model: 'brand-new-model', images: 1, basis: 'image_unit', fal: 'fal-b' });
  const max = Number(await db.sql(`select max(unit_cost_usd) from model_prices;`));
  const got = await row(`fal_request_id='fal-b'`);
  assert.equal(got.usd, max);
  assert.equal(got.usd_basis, 'estimate');
});

test('the same fal request is written once', async () => {
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 1, basis: 'image_unit', fal: 'fal-c' });
  await record({ provider: 'fal', model: 'nano-banana-pro', images: 1, basis: 'image_unit', fal: 'fal-c' });
  assert.equal(await db.sql(`select count(*) from ai_cost_events where fal_request_id='fal-c';`), '1');
});

test('rows without a fal id never collide', async () => {
  const before = Number(await db.sql(`select count(*) from ai_cost_events where fal_request_id is null;`));
  await record({ usd: 0.001 });
  await record({ usd: 0.001 });
  assert.equal(Number(await db.sql(`select count(*) from ai_cost_events where fal_request_id is null;`)), before + 2);
});

test('a non-image row without an amount is refused', async () => {
  await assert.rejects(record({ usd: 'null', basis: 'tokens' }), /usd_required/);
});

test('an unknown provider is refused by the table', async () => {
  await assert.rejects(record({ provider: 'mystery', usd: 0.1 }), /ai_cost_events_provider_check/);
});

test('members cannot read the table or call the writer', async () => {
  assert.equal(await db.sql(`select has_table_privilege('anon','public.ai_cost_events','select');`), 'f');
  assert.equal(await db.sql(`select has_table_privilege('authenticated','public.ai_cost_events','insert');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('authenticated','${SIGNATURE}','execute');`), 'f');
  assert.equal(await db.sql(`select has_function_privilege('service_role','${SIGNATURE}','execute');`), 't');
  assert.equal(await db.sql(`select relrowsecurity from pg_class where oid='public.ai_cost_events'::regclass;`), 't');
});
