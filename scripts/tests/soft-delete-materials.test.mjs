import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610090002 — 회원이 지운 재료(캐릭터·참고 이미지·쉽게 대화)는 DB 에 남지만 회원에게는 다시 안 보인다
  (2026-10-08 사용자 결정, 계획 2단계).

  회원 세션(PostgREST 와 같은 조건)으로 읽는 길은 RLS 가 막아야 한다. 허용 정책은 여럿이 OR 로 합쳐지므로
  표마다 RESTRICTIVE 정책을 둔다. 딸린 표(각도·대화 줄·묶음 항목)는 부모가 살아 있을 때만 보인다.

  운영 회원 권한은 Supabase 기본값(GRANT ALL)이라 먼저 똑같이 깐다 — 안 깔면 고치기 전에도 「거절」로 통과한다.
*/
const a = '74000000-0000-4000-8000-00000000000a';
const ids = {
  charLive: '74100000-0000-4000-8000-000000000001',
  charGone: '74100000-0000-4000-8000-000000000002',
  refLive: '74100000-0000-4000-8000-000000000003',
  refGone: '74100000-0000-4000-8000-000000000004',
  convLive: '74100000-0000-4000-8000-000000000005',
  convGone: '74100000-0000-4000-8000-000000000006',
  set: '74100000-0000-4000-8000-000000000007',
};
let db;

const asA = (body) => db.sql(`begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${a}';
  ${body}
  commit;`);
const asServer = (body) => db.sql(`begin; set local role service_role; ${body} commit;`);

before(async () => {
  db = await testPostgres();
  await db.sql(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values ('${a}','a@example.invalid',now());
    insert into public.characters(id,user_id,name,source_prompt,identity_prompt,deleted_at) values
      ('${ids.charLive}','${a}','live','p','p',null),('${ids.charGone}','${a}','gone','p','p',now());
    insert into public.character_views(character_id,user_id,angle,path) values
      ('${ids.charLive}','${a}','front','${a}/${ids.charLive}/front.png'),
      ('${ids.charGone}','${a}','front','${a}/${ids.charGone}/front.png');
    insert into public.reference_images(id,user_id,storage_path,title,deleted_at) values
      ('${ids.refLive}','${a}','${a}/references/${ids.refLive}.png','live',null),
      ('${ids.refGone}','${a}','${a}/references/${ids.refGone}.png','gone',now());
    insert into public.reference_sets(id,user_id,name) values ('${ids.set}','${a}','set');
    insert into public.reference_set_items(set_id,reference_image_id,role,position) values
      ('${ids.set}','${ids.refLive}','body',0),('${ids.set}','${ids.refGone}','body',1);
    insert into public.easy_conversations(id,user_id,title,deleted_at) values
      ('${ids.convLive}','${a}','live',null),('${ids.convGone}','${a}','gone',now());
    insert into public.easy_messages(conversation_id,role,body) values
      ('${ids.convLive}','user','live'),('${ids.convGone}','user','gone');`);
});
after(async () => { await db?.close(); });

test('a member sees only materials they have not deleted', async () => {
  assert.equal(await asA(`select string_agg(name, ',') from public.characters;`), 'live');
  assert.equal(await asA(`select string_agg(title, ',') from public.reference_images;`), 'live');
  assert.equal(await asA(`select string_agg(title, ',') from public.easy_conversations;`), 'live');
});

test('a member sees no angles, messages or set items of a deleted material', async () => {
  assert.equal(await asA(`select count(*) from public.character_views where character_id='${ids.charGone}';`), '0');
  assert.equal(await asA(`select count(*) from public.character_views;`), '1');
  assert.equal(await asA(`select string_agg(body, ',') from public.easy_messages;`), 'live');
  assert.equal(await asA(`select count(*) from public.reference_set_items where set_id='${ids.set}';`), '1');
});

test('a member cannot write under a deleted material', async () => {
  assert.equal(await asA(`with u as (update public.easy_conversations set title='x' where id='${ids.convGone}' returning 1) select count(*) from u;`), '0');
  await assert.rejects(asA(`insert into public.easy_messages(conversation_id,role,body) values ('${ids.convGone}','user','late');`));
  await assert.rejects(asA(`insert into public.reference_set_items(set_id,reference_image_id,role,position) values ('${ids.set}','${ids.refGone}','body',2);`));
});

test('the server keeps everything — deleted materials stay for the retention period', async () => {
  assert.equal(await asServer(`select count(*) from public.characters where deleted_at is not null;`), '1');
  assert.equal(await asServer(`select count(*) from public.character_views;`), '2');
  assert.equal(await asServer(`select count(*) from public.reference_images;`), '2');
  assert.equal(await asServer(`select count(*) from public.easy_messages;`), '2');
});
