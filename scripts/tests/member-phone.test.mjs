import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

// 회원 전화번호(선택, 2026-10-02 사용자 결정). 칸·함수·트리거를 더하기만 한다.
// 0002 는 독립 리뷰(2026-10-02)가 찾은 것을 고친다 — 번호가 인증 정보에 남던 것(H1),
// 형식 함수 권한(M1), 다른 서비스와 겹칠 수 있는 키 이름(M3).
const FILES = ['202610020001_member_phone.sql', '202610020002_member_phone_fix.sql'];
const migrations = FILES.map(file => new URL(`../../supabase/migrations/${file}`, import.meta.url));
const applyAll = async () => { for (const file of migrations) await db.sql(await readFile(file, 'utf8')); };
const { cases } = JSON.parse(await readFile(new URL('../../apps/web/lib/membership/__tests__/phone-cases.json', import.meta.url), 'utf8'));
const admin = randomUUID();
let db, existing;
const json = async sql => JSON.parse(await db.sql(sql));
const lit = value => value === null ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
async function signup(meta = {}, provider = 'email') {
  const id = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values('${id}','${id}@example.invalid',now(),'{"provider":"${provider}"}',${lit(JSON.stringify(meta))});`);
  return id;
}
const profile = id => json(`select to_jsonb(p) from profiles p where id='${id}';`);
const authMeta = id => json(`select raw_user_meta_data from auth.users where id='${id}';`);

before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now());
    update profiles set role='admin' where id='${admin}';`);
  existing = await signup({ display_name: '기존 회원' });
  await db.sql(`select credit_admin_grant('${existing}','bonus',10,0,'2099-01-01T00:00:00Z','${randomUUID()}','phone test','${admin}');`);
  await applyAll();
});
after(async () => { await db?.close(); });

test('migrations keep existing members, balances and names, and can be reapplied', async () => {
  await applyAll();
  const p = await profile(existing);
  assert.equal(p.phone, null);
  assert.equal(p.phone_consented_at, null);
  assert.equal(p.display_name, '기존 회원');
  assert.equal((await json(`select credit_summary('${existing}')`)).available, 10);
});

test('DB format rule gives the same answer as the app for every shared case', async () => {
  for (const [input, expected] of cases) {
    const got = await db.sql(`select coalesce(public.profile_phone(${lit(input)}), '<null>');`);
    assert.equal(got, expected ?? '<null>', `profile_phone(${JSON.stringify(input)})`);
  }
});

test('email signup stores a valid number only with consent, normalized, with a consent time', async () => {
  const yes = await signup({ fixup_phone: '01012345678', fixup_phone_consent: true });
  const p = await profile(yes);
  assert.equal(p.phone, '010-1234-5678');
  assert.ok(p.phone_consented_at);
  for (const meta of [{ fixup_phone: '010-1234-5678' }, { fixup_phone: '010-1234-5678', fixup_phone_consent: 'yes' }, { fixup_phone: '010-1234-5678', fixup_phone_consent: false }]) {
    const no = await profile(await signup(meta));
    assert.equal(no.phone, null, JSON.stringify(meta));
    assert.equal(no.phone_consented_at, null);
  }
});

/** H1: 번호를 지우거나 탈퇴하면 정말 사라져야 한다. 인증 정보에 사본이 남으면 안 된다. */
test('the signup number never stays in the auth metadata, with or without consent', async () => {
  for (const meta of [{ fixup_phone: '010-3333-4444', fixup_phone_consent: true }, { fixup_phone: '010-3333-4444' }]) {
    const id = await signup({ ...meta, display_name: '남지 않음' });
    const stored = await authMeta(id);
    assert.equal(stored.fixup_phone, undefined, JSON.stringify(meta));
    assert.equal(stored.fixup_phone_consent, undefined);
    assert.equal(stored.display_name, '남지 않음', '다른 가입 정보는 그대로다');
  }
});

/** M3: 같은 Supabase 를 쓰는 다른 서비스의 일반적인 키는 읽지도 지우지도 않는다. */
test('generic phone keys from another service are neither read nor removed', async () => {
  const id = await signup({ phone: '010-5555-6666', phone_consent: true });
  assert.equal((await profile(id)).phone, null);
  const stored = await authMeta(id);
  assert.equal(stored.phone, '010-5555-6666');
  assert.equal(stored.phone_consent, true);
});

/**
 * 가입 뒤 인증 정보를 고치는 길(회원이 브라우저에서 auth.updateUser 등)로는 번호를 저장하지
 * 않는다 — 그 길은 앱의 동의 확인·상태 검사를 거치지 않는다(독립 리뷰 재검토 M).
 * 번호는 계정 화면 한 곳에서만 저장한다. 키는 늘 지운다.
 */
test('an update of the auth account never stores a number, and still strips the keys', async () => {
  const id = await signup();
  await db.sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"fixup_phone":"02-123-4567","fixup_phone_consent":true}' where id='${id}';`);
  assert.equal((await profile(id)).phone, null);
  assert.equal((await profile(id)).phone_consented_at, null);
  const stored = await authMeta(id);
  assert.equal(stored.fixup_phone, undefined);
  assert.equal(stored.fixup_phone_consent, undefined);
});

/** 다른 서비스의 회원 갱신에도 도는 트리거다. 가입 정보가 객체가 아니어도 막지 않는다. */
test('a non-object user metadata value is left alone and never blocks the auth write', async () => {
  for (const meta of ['"fixup_phone"', '["fixup_phone"]']) {
    const id = randomUUID();
    await db.sql(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${id}','${id}@example.invalid',now(),'${meta}');`);
    assert.equal(JSON.stringify(await authMeta(id)), meta.replaceAll(' ', ''), meta);
  }
});

test('a malformed signup number never blocks signup; it is simply not stored', async () => {
  for (const value of ['+82 10 1234', [1, 2], { a: 1 }, 12345678901]) {
    const id = await signup({ fixup_phone: value, fixup_phone_consent: true, display_name: '형식 틀림' });
    const p = await profile(id);
    assert.equal(p.status, 'active', JSON.stringify(value));
    assert.equal(p.display_name, '형식 틀림');
    assert.equal(p.phone, null);
    assert.equal(p.phone_consented_at, null);
  }
});

test('social signup works without a number and the number is added later with consent', async () => {
  const id = await signup({}, 'google');
  assert.equal((await profile(id)).phone, null);
  await db.sql(`update profiles set phone='010-2222-3333', phone_consented_at=now() where id='${id}';`);
  assert.equal((await profile(id)).phone, '010-2222-3333');
});

test('the table refuses a number without consent or in a non-canonical form', async () => {
  const id = await signup();
  await assert.rejects(db.sql(`update profiles set phone='010-1234-5678' where id='${id}';`), /profiles_phone_valid/);
  await assert.rejects(db.sql(`update profiles set phone='01012345678', phone_consented_at=now() where id='${id}';`), /profiles_phone_valid/);
  await db.sql(`update profiles set phone=null, phone_consented_at=null where id='${id}';`);
});

/** M1: 시험 DB 는 최고 권한으로 돌아 이것을 못 잡았다. 표를 쓸 수 있는 다른 역할로 재 본다. */
test('a role that may write profiles is not blocked by the format rule', async () => {
  const id = await signup();
  // 다른 서비스의 서버 역할처럼 행 보안을 건너뛴다. 안 그러면 고칠 행이 0개라 제약까지 안 간다.
  await db.sql(`do $$ begin if not exists (select 1 from pg_roles where rolname='other_writer') then create role other_writer nologin bypassrls; end if; end $$;
    grant usage on schema public to other_writer; grant select, update on public.profiles to other_writer;`);
  const touched = await db.sql(`set role other_writer; with done as (update public.profiles set updated_at=now() where id='${id}' returning 1) select count(*) from done;`);
  await db.sql('reset role;');
  assert.equal(touched, '1');
});

test('members cannot write their own number directly; only the server path can', async () => {
  const id = await signup();
  await assert.rejects(db.sql(`set role authenticated;update profiles set phone='010-1234-5678', phone_consented_at=now() where id='${id}';`), /permission denied/);
  await db.sql('reset role;');
});

test('withdrawal scrubs the number and its consent but keeps financial records', async () => {
  const id = await signup({ fixup_phone: '010-7777-8888', fixup_phone_consent: true, display_name: '떠나는 회원' });
  await db.sql(`select credit_admin_grant('${id}','bonus',5,0,'2099-01-01T00:00:00Z','${randomUUID()}','phone test','${admin}');`);
  await db.sql(`select member_withdraw('${id}');`);
  const p = await profile(id);
  assert.equal(p.status, 'withdrawn');
  assert.equal(p.phone, null);
  assert.equal(p.phone_consented_at, null);
  assert.equal(await db.sql(`select count(*) from credit_grants where user_id='${id}';`), '1');
  // 닫힌 계정에 번호를 다시 넣을 수 없다.
  await db.sql(`update profiles set phone='010-7777-8888', phone_consented_at=now() where id='${id}';`);
  assert.equal((await profile(id)).phone, null);
});
