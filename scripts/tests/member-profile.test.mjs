import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609220005 — 회원 이름·추천인(2026-09-22 사용자 결정).
  가입할 때 이름·추천인을 받고, 계정 화면·관리자 화면에서 보고 고친다.
  추천인은 검증하지 않는 입력란이다 — 적은 그대로 저장만 한다.
*/
const admin = '60000000-0000-4000-8000-000000000001';
let db;
const json = async (q) => JSON.parse(await db.sql(q));
const signup = (id, email, meta) => db.sql(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values('${id}','${email}',null,'${JSON.stringify(meta).replace(/'/g, "''")}'::jsonb);`);

before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set status='active',role='admin' where id='${admin}';`);
});
after(async () => { await db?.close(); });

test('signup carries the name and referrer into the profile', async () => {
  const id = randomUUID();
  await signup(id, 'kim@example.invalid', { display_name: '  김철수 ', referrer_input: '이영희 (마케팅팀)' });
  const row = await json(`select to_jsonb(p) from (select display_name,referrer_input from profiles where id='${id}') p;`);
  assert.equal(row.display_name, '김철수');
  assert.equal(row.referrer_input, '이영희 (마케팅팀)');
});

test('an empty referrer is stored as nothing, not as an empty string', async () => {
  const id = randomUUID();
  await signup(id, 'lee@example.invalid', { display_name: '이영희', referrer_input: '   ' });
  assert.equal(await db.sql(`select referrer_input is null from profiles where id='${id}';`), 't');
});

/** 이메일 인증·이메일 변경이 가입 때 값으로 되돌리면 계정 화면에서 고친 이름이 사라진다. */
test('confirming the email later does not overwrite a name edited since', async () => {
  const id = randomUUID();
  await signup(id, 'park@example.invalid', { display_name: '박원래' });
  await db.sql(`update profiles set display_name='박바꿈' where id='${id}';`);
  await db.sql(`update auth.users set email_confirmed_at=now() where id='${id}';`);
  await db.sql(`update auth.users set email='park2@example.invalid' where id='${id}';`);
  const row = await json(`select to_jsonb(p) from (select display_name,email from profiles where id='${id}') p;`);
  assert.equal(row.display_name, '박바꿈');
  assert.equal(row.email, 'park2@example.invalid');
});

test('overlong values are cut rather than blocking the signup', async () => {
  const id = randomUUID();
  await signup(id, 'long@example.invalid', { display_name: '가'.repeat(80), referrer_input: '나'.repeat(150) });
  const row = await json(`select to_jsonb(p) from (select display_name,referrer_input from profiles where id='${id}') p;`);
  assert.equal([...row.display_name].length, 40);
  assert.equal([...row.referrer_input].length, 100);
});

test('the admin member list shows and searches name and referrer', async () => {
  const list = await json(`select credit_admin_members('${admin}','김철수','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].display_name, '김철수');
  assert.equal(list.items[0].referrer_input, '이영희 (마케팅팀)');
  const byReferrer = await json(`select credit_admin_members('${admin}','마케팅팀','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(byReferrer.items.length, 1);
  const byEmail = await json(`select credit_admin_members('${admin}','lee@','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(byEmail.items[0].display_name, '이영희');
});

/** 검색어의 % _ 는 글자로 찾는다. 「%」 하나로 전원이 나오면 안 된다. */
test('search treats % and _ as plain characters', async () => {
  const list = await json(`select credit_admin_members('${admin}','%','',null,'',false,'created','desc',50,0,'',false);`);
  assert.equal(list.items.length, 0);
});

test('members still read only their own profile', async () => {
  assert.equal(await db.sql(`select has_table_privilege('authenticated','public.profiles','UPDATE');`), 'f');
});
