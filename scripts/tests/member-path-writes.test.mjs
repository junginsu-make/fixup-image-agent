import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202610030002 — 회원은 그림 저장 위치 칸을 쓰지 못한다(2026-10-03 보안 리뷰).

  라이브러리·캐릭터 각도·스타일 참고 줄의 위치(path) 칸을 회원이 자기 토큰으로
  아무 글자로나 쓸 수 있었다. 행 정책은 「내 줄인가」만 보고 위치가 누구 것인지는
  안 본다. 서버는 그 위치를 서버 권한으로 서명·다운로드·삭제하므로, 남의 위치를
  적어 두면 남의 그림이 열리거나 지워졌다.

  운영의 회원 권한은 Supabase 기본값 그대로다 — 2026-10-03 운영 확인:
  네 표 모두 authenticated 에 INSERT·UPDATE 가 붙어 있었다. 이 시험 클러스터는
  그 기본값을 안 깔므로 먼저 똑같이 깐다. 안 깔면 고치기 전에도 「거절」로
  통과해 아무것도 지키지 않는다.
*/
const a = '72000000-0000-4000-8000-00000000000a';
const b = '72000000-0000-4000-8000-00000000000b';
const aChar = '72100000-0000-4000-8000-000000000001';
const aView = '72100000-0000-4000-8000-000000000002';
const aItem = '72100000-0000-4000-8000-000000000003';
const aImage = '72100000-0000-4000-8000-000000000004';
const aStyle = '72100000-0000-4000-8000-000000000005';
const aProject = '72100000-0000-4000-8000-000000000006';
const bChar = '72200000-0000-4000-8000-000000000001';
const victim = `${b}/${bChar}/front.png`;
let db;

/** 회원 a 의 세션으로 돌린다 — 회원 토큰으로 PostgREST 를 부르는 것과 같은 조건. */
const asA = (body) => db.sql(`begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${a}';
  ${body}
  commit;`);

before(async () => {
  db = await testPostgres();
  await db.sql(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${a}','a@example.invalid',now()),('${b}','b@example.invalid',now());
    insert into public.characters(id,user_id,name,source_prompt,identity_prompt) values
      ('${aChar}','${a}','a','a','a'),('${bChar}','${b}','b','b','b');
    insert into public.character_views(id,character_id,user_id,angle,path)
      values('${aView}','${aChar}','${a}','front','${a}/${aChar}/front.png');
    insert into public.library_items(id,user_id,title,tool,cover_path)
      values('${aItem}','${a}','t','create','${a}/${aItem}/0.png');
    insert into public.library_images(id,item_id,user_id,position,path)
      values('${aImage}','${aItem}','${a}',0,'${a}/${aItem}/0.png');
    insert into public.style_references(id,user_id,name,path,description)
      values('${aStyle}','${a}','s','${a}/${aStyle}.png','d');
    insert into public.sns_projects(id,user_id,title,ratio,model_id) values('${aProject}','${a}','p','1:1','m');
    insert into public.sns_cards(user_id,project_id,index,role) values('${a}','${aProject}',0,'cover');`);
});
after(async () => { await db?.close(); });

const denied = /permission denied/;

test('a member cannot point a character angle at someone else’s file', async () => {
  await assert.rejects(asA(`update public.character_views set path='${victim}' where id='${aView}';`), denied);
  await assert.rejects(asA(`update public.character_views set thumb_path='${victim}' where id='${aView}';`), denied);
  await assert.rejects(asA(`insert into public.character_views(character_id,user_id,angle,path)
    values('${aChar}','${a}','back','${victim}');`), denied);
});

test('a member cannot point a library work or image at someone else’s file', async () => {
  await assert.rejects(asA(`update public.library_items set cover_path='${victim}' where id='${aItem}';`), denied);
  await assert.rejects(asA(`update public.library_items set cover_thumb_path='${victim}' where id='${aItem}';`), denied);
  await assert.rejects(asA(`update public.library_images set path='${victim}' where id='${aImage}';`), denied);
  await assert.rejects(asA(`update public.library_images set thumb_path='${victim}' where id='${aImage}';`), denied);
  await assert.rejects(asA(`insert into public.library_items(user_id,title,tool,cover_path)
    values('${a}','t','create','${victim}');`), denied);
  await assert.rejects(asA(`insert into public.library_images(item_id,user_id,position,path)
    values('${aItem}','${a}',1,'${victim}');`), denied);
});

test('a member cannot point a style reference at someone else’s file', async () => {
  await assert.rejects(asA(`update public.style_references set path='${victim}' where id='${aStyle}';`), denied);
  await assert.rejects(asA(`update public.style_references set thumb_path='${victim}' where id='${aStyle}';`), denied);
  await assert.rejects(asA(`insert into public.style_references(user_id,name,path,description)
    values('${a}','s','${victim}','d');`), denied);
});

test('members still read and delete their own rows (only writing the location is closed)', async () => {
  assert.equal(await asA(`select count(*) from public.character_views;`), '1');
  assert.equal(await asA(`select count(*) from public.library_images;`), '1');
  assert.equal(await asA(`select count(*) from public.style_references;`), '1');
  assert.equal(await asA(`delete from public.style_references where id='${aStyle}' returning 1;`), '1');
});

test('the server (service role) still writes locations', async () => {
  assert.equal(await db.sql(`begin; set local role service_role;
    update public.character_views set path='${a}/${aChar}/front.webp' where id='${aView}' returning path; commit;`),
    `${a}/${aChar}/front.webp`);
});

test('a card image location must stay in the member’s own folder', async () => {
  // 카드뉴스 생성은 회원 토큰으로 이 칸을 쓴다(lib/sns/runtime.ts updateCard) — 권한을 거두지 않고 모양을 묶는다.
  const own = `${a}/sns/${aProject}/0.png`;
  assert.equal(await asA(`update public.sns_cards set asset_path='${own}', thumb_path='${a}/sns/${aProject}/0.thumb.webp'
    where project_id='${aProject}' returning asset_path;`), own);
  for (const bad of [victim, `${a}/x/%2e%2e/%2e%2e/${victim}`, `${a}/x/../../${victim}`, `${a}/x/.\t./${victim}`, `${a}\\..\\${victim}`]) {
    await assert.rejects(asA(`update public.sns_cards set asset_path=$q$${bad}$q$ where project_id='${aProject}';`), /check constraint/, bad);
    await assert.rejects(asA(`update public.sns_cards set thumb_path=$q$${bad}$q$ where project_id='${aProject}';`), /check constraint/, bad);
  }
  assert.equal(await asA(`update public.sns_cards set asset_path=null, copy='{"t":1}'::jsonb where project_id='${aProject}' returning 1;`), '1');
});
