import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

const migration = new URL('../../supabase/migrations/202610010001_social_signup.sql', import.meta.url);
const admin = randomUUID(), existing = randomUUID();
let db;
const json = async sql => JSON.parse(await db.sql(sql));
async function signup(provider = 'google', metadata = '{}') {
  const id = randomUUID();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
    values('${id}','${id}@example.invalid',now(),'{"provider":"${provider}"}','${metadata}');`);
  return id;
}
const complete = (id, version = '2026-10-01', age = true, terms = true) => db.sql(`select complete_social_onboarding('${id}','New member','friend',${age},${terms},'${version}');`);
const grant = (id, source = randomUUID()) => db.sql(`select credit_admin_grant('${id}','bonus',10,0,'2099-01-01T00:00:00Z','${source}','manual signup support','${admin}');`);
const profile = id => json(`select to_jsonb(p) from profiles p where id='${id}';`);
before(async () => {
  db = await testPostgres();
  await db.sql(`alter table auth.users add column if not exists raw_app_meta_data jsonb not null default '{}';`);
  await db.migrate([], { until: '20260930' });
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.invalid',now()),('${existing}','existing@example.invalid',now());
    update profiles set role='admin' where id='${admin}';`);
  await grant(existing);
  await db.sql(await readFile(migration, 'utf8'));
});
after(async () => { await db?.close(); });

test('migration leaves existing accounts, balances and identities untouched and can be reapplied', async () => {
  await db.sql(await readFile(migration, 'utf8'));
  const p = await profile(existing);
  assert.equal(p.onboarding_required, false);
  assert.equal(p.signup_provider, null);
  assert.equal((await json(`select credit_summary('${existing}')`)).available, 10);
});
test('Google and Kakao get one empty wallet and no automatic grant', async () => {
  for (const provider of ['google', 'kakao']) {
    const id = await signup(provider);
    const p = await profile(id);
    assert.equal(p.role, 'member'); assert.equal(p.signup_provider, provider);
    assert.equal(p.onboarding_required, true); assert.equal(p.onboarding_completed_at, null);
    assert.equal(await db.sql(`select count(*) from credit_accounts where user_id='${id}';`), '1');
    assert.equal(await db.sql(`select count(*) from credit_grants where user_id='${id}';`), '0');
    assert.equal((await json(`select credit_summary('${id}')`)).available, 0);
    await assert.rejects(grant(id), /onboarding_required/);
  }
});
test('user-editable provider metadata cannot bypass onboarding; email signup stays unchanged', async () => {
  const social = await signup('google', '{"provider":"email","role":"admin","onboarding_completed_at":"2026-01-01"}');
  assert.equal((await profile(social)).onboarding_required, true);
  const email = await signup('email', '{"provider":"google"}');
  assert.equal((await profile(email)).onboarding_required, false);
  assert.equal((await json(`select credit_summary('${email}')`)).available, 0);
});
test('completion requires consent and verified email and does not give credits', async () => {
  const id = await signup();
  for (const [v, a, t] of [['old', true, true], ['2026-10-01', false, true], ['2026-10-01', true, false]]) {
    await assert.rejects(complete(id, v, a, t), /invalid_signup_consent/);
  }
  await assert.rejects(db.sql(`select complete_social_onboarding('${id}','  ','',true,true,'2026-10-01');`), /invalid_profile/);
  await db.sql(`update auth.users set email_confirmed_at=null where id='${id}';`);
  await assert.rejects(complete(id), /inactive_member/);
  await db.sql(`update auth.users set email_confirmed_at=now() where id='${id}';`);
  await complete(id);
  const p = await profile(id);
  assert.ok(p.onboarding_completed_at); assert.ok(p.signup_terms_accepted_at); assert.ok(p.signup_age_confirmed_at);
  assert.equal(p.signup_terms_version, '2026-10-01');
  assert.equal((await json(`select credit_summary('${id}')`)).available, 0);
});
test('concurrent completion, auth updates and retry preserve the first completion and edited profile', async () => {
  const id = await signup();
  await Promise.all([complete(id), complete(id)]);
  const first = await profile(id);
  await db.sql(`update profiles set display_name='Edited' where id='${id}';
    update auth.users set email='changed-${id}@example.invalid' where id='${id}';`);
  await complete(id);
  const after = await profile(id);
  assert.equal(after.display_name, 'Edited'); assert.equal(after.onboarding_completed_at, first.onboarding_completed_at);
  assert.equal(after.signup_provider, 'google');
});
test('existing email account gaining a social identity is not reset', async () => {
  await db.sql(`update auth.users set raw_app_meta_data='{"provider":"google"}',email_confirmed_at=now() where id='${existing}';`);
  assert.equal((await profile(existing)).onboarding_required, false);
  assert.equal((await json(`select credit_summary('${existing}')`)).available, 10);
});
test('suspended and withdrawn profiles cannot complete or revive themselves', async () => {
  for (const status of ['suspended', 'withdrawn']) {
    const id = await signup();
    await db.sql(`update profiles set status='${status}' where id='${id}'; update auth.users set email_confirmed_at=now() where id='${id}';`);
    await assert.rejects(complete(id), /inactive_member/);
    assert.equal((await profile(id)).status, status);
  }
});
test('empty wallet refuses AI; manual grant once enables reserve and exactly-once settlement', async () => {
  const id = await signup(); await complete(id);
  const reserve = request => json(`select credit_reserve('${id}','${request}','poster_image',array[1],'poster:test',10);`);
  assert.equal((await reserve(randomUUID())).reason, 'credits_required');
  const source = randomUUID(); assert.equal(await grant(id, source), await grant(id, source));
  assert.equal((await json(`select credit_summary('${id}')`)).available, 10);
  const req = randomUUID(); assert.equal((await reserve(req)).allowed, true);
  await db.sql(`select credit_finalize('${id}','${req}',array[0],true,null);select credit_finalize('${id}','${req}',array[0],true,null);`);
  assert.equal((await json(`select credit_summary('${id}')`)).available, 9);
  assert.equal(await db.sql(`select count(*) from credit_grants where user_id='${id}';`), '1');
});
test('unfinished users cannot write through RLS or start free AI via a service RPC', async () => {
  const id = await signup();
  await assert.rejects(db.sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';
    insert into reference_sets(user_id,name) values('${id}','bypass');commit;`), /row-level security/);
  await assert.rejects(db.sql(`select credit_reserve('${id}','${randomUUID()}','cs_ask',array[]::integer[],'cs:ask',10);`), /onboarding_required/);
  await complete(id);
  await db.sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';
    insert into reference_sets(user_id,name) values('${id}','allowed after completion');commit;`);
  assert.equal(await db.sql(`begin;set local role authenticated;set local request.jwt.claim.sub='${id}';
    select member_onboarding_complete();commit;`), 't');
});
test('members cannot forge completion, grant or write profile completion columns', async () => {
  const id = await signup();
  await assert.rejects(db.sql(`set role authenticated;select complete_social_onboarding('${id}','x','',true,true,'2026-10-01');`), /permission denied/);
  await assert.rejects(db.sql(`set role authenticated;update profiles set onboarding_completed_at=now() where id='${id}';`), /permission denied/);
  await assert.rejects(db.sql(`select credit_admin_grant('${existing}','bonus',1,0,now()+interval '1 day','${randomUUID()}','unauthorized','${id}');`), /credit_admin_required/);
});
test('a completed social member can still withdraw and scrub their name while retaining financial records', async () => {
  const id = await signup(); await complete(id); await grant(id);
  await db.sql(`select member_withdraw('${id}');`);
  const p = await profile(id);
  assert.equal(p.status, 'withdrawn'); assert.equal(p.display_name, null); assert.equal(p.referrer_input, null);
  assert.ok(p.onboarding_completed_at);
  assert.equal(await db.sql(`select count(*) from credit_grants where user_id='${id}';`), '1');
  await assert.rejects(complete(id), /inactive_member/);
});
test('missing ledger cannot be accepted as a completed signup', async () => {
  const id = await signup();
  await db.sql(`delete from credit_accounts where user_id='${id}';`);
  await assert.rejects(complete(id), /credit_account_not_activated/);
  assert.equal((await profile(id)).onboarding_completed_at, null);
});
