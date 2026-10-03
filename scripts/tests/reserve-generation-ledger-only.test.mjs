import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610030003 — 옛 예약 함수(`reserve_generation`)로는 아무도 못 쓴다(2026-10-03 사용자 결정:
  「상세페이지 크레딧을 비켜가면 안 됩니다」).

  같은 DB 를 쓰는 별도 상세페이지 제품이 이 함수를 부른다. 202609220002 가 「새 장부로 옮긴 회원은
  옛 길로 못 쓴다」는 줄을 넣었는데, 202609280001(CS 도우미 작업 추가)이 함수를 옛 판으로 통째로
  다시 쓰면서 그 줄이 사라졌다 — 크레딧 0 인 새 회원도 한 달 100장이 「허용」됐다.
  앞선 시험들은 202609220002 까지만 깔고 돌아 이것을 못 봤다. **여기서는 마이그레이션을 전부 깐다.**
*/
const admin = '91000000-0000-4000-8000-000000000001';
let db;
const json = async (q) => JSON.parse(await db.sql(q));

async function member(credits = 0) {
  const user = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','${user}@example.invalid',now());
    update profiles set status='active' where id='${user}';`);
  if (credits > 0) {
    await db.sql(`select credit_admin_grant('${user}','bonus',${credits},0,now()+interval '3 months','g-${randomUUID()}','fixture','${admin}');`);
  }
  return user;
}
const oldReserve = (user, request = randomUUID()) =>
  json(`select to_jsonb(r) from reserve_generation('${user}','${request}','pdp_image',1,10) r;`);

before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
});
after(async () => { await db?.close(); });

test('a new member with no credits cannot reserve through the old entry point', async () => {
  const user = await member();
  const request = randomUUID();
  const result = await oldReserve(user, request);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'credit_ledger_required');
  assert.equal(await db.sql(`select count(*) from generation_events where request_id='${request}';`), '0');
});

test('credits do not open the old entry point either — spending goes through the ledger only', async () => {
  const user = await member(100);
  const result = await oldReserve(user);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'credit_ledger_required');
});

test('a profile without a ledger account is refused too (the old monthly quota is gone)', async () => {
  const user = await member();
  await db.sql(`delete from credit_accounts where user_id='${user}';`);
  const result = await oldReserve(user);
  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'credit_ledger_required');
});

test('the app path (ledger dispatch) still reserves and settles credits', async () => {
  const user = await member(100);
  const request = randomUUID();
  const reserved = await json(`select credit_reserve_dispatch('${user}','${request}','pdp_image',1,10,array[1],'pdp:image');`);
  assert.equal(reserved.allowed, true, JSON.stringify(reserved));
  const settled = await json(`select credit_finalize_dispatch('${user}','${request}',true,1,1,true,null);`);
  assert.ok(settled, 'settlement returned nothing');
  assert.equal(await db.sql(`select status from generation_events where request_id='${request}';`), 'succeeded');
});
