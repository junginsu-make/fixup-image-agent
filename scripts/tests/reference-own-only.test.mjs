import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testPostgres } from '../lib/test-credit-postgres.mjs';

/*
  202609280004 — 참고 이미지는 올린 사람만 본다(2026-09-28 사용자 결정).

  > 참고 이미지도 사용자별로 구분 시켜주세요. 이 시스템에 팀 시스템이 있긴하지만,
  > 그건 지금 사용하지 않을 계획입니다.

  유료 공개 전이라 모르는 고객끼리 같은 창고를 쓰게 된다. 한 사람이 올린 제품
  사진·얼굴 사진이 다른 고객의 고르기 창에 보이면 안 된다. 팀이 붙었든 안
  붙었든 **남의 것은 안 보인다.**

  정책 식은 묻는 사람의 권한으로 돈다 — 그래서 실제로 회원 역할로 바꿔
  읽어 본다. 함수 본문 문자열을 맞추는 시험은 무력화를 못 잡는다.
*/
const a = '70000000-0000-4000-8000-00000000000a';
const b = '70000000-0000-4000-8000-00000000000b';
const team = '70000000-0000-4000-8000-0000000000f1';
let db;

const image = (id, owner, title) => `insert into public.reference_images(id,user_id,storage_path,title)
  values('${id}','${owner}','${owner}/references/${id}.png','${title}');`;

/** 그 회원의 세션으로 읽었을 때 보이는 제목들. */
const visibleTo = (user) => db.sql(`begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${user}';
  select coalesce(string_agg(title, ',' order by title), '') from public.reference_images;
  commit;`);

before(async () => {
  db = await testPostgres();
  await db.migrate();
  await db.sql(`insert into auth.users(id,email,email_confirmed_at) values
      ('${a}','a@example.invalid',now()),('${b}','b@example.invalid',now());
    insert into public.teams(id,name) values('${team}','같은 팀');
    insert into public.team_members(user_id,team_id) values('${a}','${team}'),('${b}','${team}');
    ${image('71000000-0000-4000-8000-000000000001', a, 'a-mine')}
    ${image('71000000-0000-4000-8000-000000000002', b, 'b-loose')}
    ${image('71000000-0000-4000-8000-000000000003', b, 'b-team')}
    update public.reference_images set team_id=null
      where id in ('71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002');
    update public.reference_images set team_id='${team}' where id='71000000-0000-4000-8000-000000000003';`);
});
after(async () => { await db?.close(); });

test('a member sees only the images they uploaded', async () => {
  assert.equal(await visibleTo(a), 'a-mine');
  assert.equal(await visibleTo(b), 'b-loose,b-team');
});

test("another member's image without a team is not shared", async () => {
  // 전에는 팀이 안 붙은 것은 누구나 봤다(공용 창고, 202609070006).
  assert.ok(!(await visibleTo(a)).split(',').includes('b-loose'));
});

test("a teammate's image is not shared either", async () => {
  // 팀 기능을 안 쓴다. 팀 표에 남아 있는 소속이 공유를 되살리면 안 된다.
  assert.ok(!(await visibleTo(a)).split(',').includes('b-team'));
});

test('my own image stays visible even with a team stamped on it', async () => {
  await db.sql(`update public.reference_images set team_id='${team}' where id='71000000-0000-4000-8000-000000000001';`);
  try {
    assert.equal(await visibleTo(a), 'a-mine');
  } finally {
    await db.sql(`update public.reference_images set team_id=null where id='71000000-0000-4000-8000-000000000001';`);
  }
});

test('nobody signed in sees nothing', async () => {
  assert.equal(await db.sql(`begin;
    set local role authenticated;
    select count(*) from public.reference_images;
    commit;`), '0');
});
