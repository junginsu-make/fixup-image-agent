import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610090001 — 회원이 지운 생성 결과는 DB 에 남지만 회원에게는 다시 안 보인다(2026-10-08 사용자 결정).

  회원 세션(PostgREST 와 같은 조건)으로 읽는 길은 RLS 가 막아야 한다. 허용 정책은 여럿이 OR 로 합쳐지므로
  (자기 것 정책 + 팀 읽기 정책 — 팀이 없으면 자기 줄에도 참이다) 한 정책에만 조건을 걸면 새어 나간다.
  그래서 표마다 RESTRICTIVE 정책을 둔다. 딸린 표(카드·그림·요청)는 부모가 살아 있을 때만 보인다.

  운영 회원 권한은 Supabase 기본값(GRANT ALL)이라 먼저 똑같이 깐다 — 안 깔면 고치기 전에도 「거절」로 통과한다.
*/
const a = '73000000-0000-4000-8000-00000000000a';
const ids = {
  snsLive: '73100000-0000-4000-8000-000000000001',
  snsGone: '73100000-0000-4000-8000-000000000002',
  posterLive: '73100000-0000-4000-8000-000000000003',
  posterGone: '73100000-0000-4000-8000-000000000004',
  reqLive: '73100000-0000-4000-8000-000000000005',
  reqGone: '73100000-0000-4000-8000-000000000006',
  itemLive: '73100000-0000-4000-8000-000000000007',
  itemGone: '73100000-0000-4000-8000-000000000008',
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
    insert into public.sns_projects(id,user_id,title,ratio,model_id,deleted_at) values
      ('${ids.snsLive}','${a}','live','1:1','m',null),('${ids.snsGone}','${a}','gone','1:1','m',now());
    insert into public.sns_cards(user_id,project_id,index,role) values
      ('${a}','${ids.snsLive}',0,'cover'),('${a}','${ids.snsGone}',0,'cover');
    insert into public.poster_projects(id,user_id,title,ratio,model_id,deleted_at) values
      ('${ids.posterLive}','${a}','live','1:1','m',null),('${ids.posterGone}','${a}','gone','1:1','m',now());
    insert into public.poster_generation_requests(id,user_id,project_id,model_id,ratio_id,mode,requested_images) values
      ('${ids.reqLive}','${a}','${ids.posterLive}','m','1:1','t2i',1),('${ids.reqGone}','${a}','${ids.posterGone}','m','1:1','t2i',1);
    insert into public.poster_images(user_id,project_id,generation_request_id,variant_index,asset_path) values
      ('${a}','${ids.posterLive}','${ids.reqLive}',0,'${a}/poster/${ids.posterLive}/0.png'),
      ('${a}','${ids.posterGone}','${ids.reqGone}',0,'${a}/poster/${ids.posterGone}/0.png');
    insert into public.library_items(id,user_id,title,tool,deleted_at) values
      ('${ids.itemLive}','${a}','live','create',null),('${ids.itemGone}','${a}','gone','ad',now());
    insert into public.library_images(item_id,user_id,position,path) values
      ('${ids.itemLive}','${a}',0,'${a}/${ids.itemLive}/0.png'),('${ids.itemGone}','${a}',0,'${a}/${ids.itemGone}/0.png');`);
});
after(async () => { await db?.close(); });

test('a member sees only works they have not deleted', async () => {
  assert.equal(await asA(`select string_agg(title, ',') from public.sns_projects;`), 'live');
  assert.equal(await asA(`select string_agg(title, ',') from public.poster_projects;`), 'live');
  assert.equal(await asA(`select string_agg(title, ',') from public.library_items;`), 'live');
});

test('a member sees no cards, images or requests of a deleted work', async () => {
  assert.equal(await asA(`select count(*) from public.sns_cards;`), '1');
  assert.equal(await asA(`select count(*) from public.sns_cards where project_id='${ids.snsGone}';`), '0');
  assert.equal(await asA(`select count(*) from public.poster_images where project_id='${ids.posterGone}';`), '0');
  assert.equal(await asA(`select count(*) from public.poster_generation_requests where project_id='${ids.posterGone}';`), '0');
  assert.equal(await asA(`select count(*) from public.library_images where item_id='${ids.itemGone}';`), '0');
});

test('a member cannot change anything under a deleted work', async () => {
  assert.equal(await asA(`with u as (update public.sns_cards set copy='{"x":1}'::jsonb where project_id='${ids.snsGone}' returning 1) select count(*) from u;`), '0');
  assert.equal(await asA(`with u as (update public.poster_images set selected=true where project_id='${ids.posterGone}' returning 1) select count(*) from u;`), '0');
});

test('the server keeps everything — deleted works stay for the retention period', async () => {
  assert.equal(await asServer(`select count(*) from public.sns_projects where deleted_at is not null;`), '1');
  assert.equal(await asServer(`select count(*) from public.poster_images;`), '2');
  assert.equal(await asServer(`select count(*) from public.library_images;`), '2');
});

test('card news planning still replaces the cards of a live work (it deletes and inserts with the member token)', async () => {
  assert.equal(await asA(`with d as (delete from public.sns_cards where project_id='${ids.snsLive}' returning 1) select count(*) from d;`), '1');
});
