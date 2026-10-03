import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { readdir } from "node:fs/promises";
import { test } from "node:test";
// 실제 Postgres 엔진(PGlite)에서 SQL·권한·버전 전이를 검사한다. 운영 DB는 사용하지 않는다.
const modulePath = process.env.PDP_PGLITE_MODULE;
if (!modulePath) throw new Error("PDP_PGLITE_MODULE에 로컬 PGlite 모듈 URL을 지정하세요.");
const { PGlite } = await import(modulePath);
test("문서 SQL: 소유권, 버전 보관, 충돌, 직접 쓰기 차단, 삭제", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema public, auth to authenticated, anon, service_role;
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      insert into storage.buckets(id,name,public) values('pdp-documents','pdp-documents',true);
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
    await db.exec(await readFile(new URL("../../supabase/migrations/202610030001_pdp_documents.sql", import.meta.url), "utf8"));
    const bucket=(await db.query("select public,file_size_limit from storage.buckets where id='pdp-documents'")).rows[0];
    assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),20971520);
    await db.exec("set role service_role");
    const u = "11111111-1111-4111-8111-111111111111", v = "22222222-2222-4222-8222-222222222222";
    const id = "33333333-3333-4333-8333-333333333333";
    const call = async (user, action, payload = {}) => (await db.query(
      "select public.pdp_document_write($1::uuid,$2::uuid,$3::text,$4::jsonb) as result",
      [user,id,action,JSON.stringify(payload)])).rows[0].result;
    assert.equal((await call(u,"create",{ sourceDraftId: "legacy" })).status, 200);
    assert.equal((await call(v,"create")).status,404);
    assert.equal((await call(v,"delete")).status,404);
    for (let i=0;i<24;i++) {
      const document = { schemaVersion: 3, id, title: String(i), stage: "input", sourceMode: "image", assets:{}, body:{sections:[]} };
      assert.equal((await call(u,"save",{baseRevision:i,document,requestId:crypto.randomUUID()})).status,200);
    }
    assert.equal((await call(u,"save",{baseRevision:1,document:{},requestId:crypto.randomUUID()})).status,409);
    const summary=(await db.query("select summary from pdp_documents where id=$1",[id])).rows[0].summary;
    assert.deepEqual(summary,{title:"23",stage:"input",sectionCount:0,aspectRatio:null,imageCount:0,cover:null,imageTags:[]});
    const revisions = await db.query("select revision from pdp_document_revisions order by revision");
    assert.equal(revisions.rows.length,20); assert.equal(revisions.rows[0].revision,4);
    const sizeDoc={schemaVersion:3,id,title:"size",stage:"editor",sourceMode:"image",assets:{},body:{sections:[],notice:""}};
    const size=(await db.query("select octet_length($1::jsonb::text) as bytes",[JSON.stringify(sizeDoc)])).rows[0].bytes;
    sizeDoc.body.notice="x".repeat(1048576-size);
    assert.equal((await call(u,"save",{baseRevision:24,document:sizeDoc,requestId:crypto.randomUUID()})).status,200);
    sizeDoc.body.notice+="x";
    assert.equal((await call(u,"save",{baseRevision:25,document:sizeDoc,requestId:crypto.randomUUID()})).status,413);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${v}';`);
    assert.equal((await db.query("select * from pdp_documents")).rows.length,0);
    assert.equal((await db.query("select * from pdp_document_revisions")).rows.length,0);
    await assert.rejects(db.exec("update pdp_documents set revision=100"));
    await assert.rejects(call(u,"create"));
    await db.exec("reset role");
    assert.equal((await call(u,"delete")).status,200);
    assert.equal((await call(u,"save",{baseRevision:24,document:{},requestId:crypto.randomUUID()})).status,404);
    assert.equal((await call(u,"purge")).status,200);
    assert.equal((await call(u,"create")).status,404);
    assert.equal((await db.query("select * from pdp_document_revisions")).rows.length,0);
    const pinnedId="44444444-4444-4444-8444-444444444444";
    const pinCall=async(action,payload={})=>(await db.query("select pdp_document_write($1::uuid,$2::uuid,$3::text,$4::jsonb) result",
      [u,pinnedId,action,JSON.stringify(payload)])).rows[0].result;
    await pinCall("create");
    for(let i=0;i<35;i++){
      await pinCall("save",{baseRevision:i,requestId:crypto.randomUUID(),document:{schemaVersion:3,id:pinnedId,title:String(i),stage:"input",sourceMode:"image",assets:{},body:{sections:[]}}});
      if(i<7)assert.equal((await pinCall("pin",{revision:i+1})).status,200);
    }
    const kept=(await db.query("select revision,pinned from pdp_document_revisions where document_id=$1 order by revision",[pinnedId])).rows;
    assert.deepEqual(kept.filter(row=>row.pinned).map(row=>row.revision),[3,4,5,6,7]);
    assert.equal(kept.filter(row=>!row.pinned).length,20);
    await pinCall("delete");assert.equal((await db.query("select cleanup_pending from pdp_documents where id=$1",[pinnedId])).rows[0].cleanup_pending,true);
    await pinCall("purge");assert.equal((await db.query("select cleanup_pending from pdp_documents where id=$1",[pinnedId])).rows[0].cleanup_pending,false);
  } finally { await db.close(); }
});
// 3차 리뷰 W8·W17·W18·W22. Supabase 처럼 새 함수·표에 기본 권한을 주는 환경에서 적용한다.
async function supabaseLikeDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema public, auth to authenticated, anon, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  await db.exec(await readFile(new URL("../../supabase/migrations/202610030001_pdp_documents.sql", import.meta.url), "utf8"));
  return db;
}
const U = "11111111-1111-4111-8111-111111111111", ADMIN = "22222222-2222-4222-8222-222222222222";
const writeAs = (db, user, id) => async (action, payload = {}) => (await db.query(
  "select public.pdp_document_write($1::uuid,$2::uuid,$3::text,$4::jsonb) as result", [user, id, action, JSON.stringify(payload)])).rows[0].result;
const plainDoc = (id, title) => ({ schemaVersion: 3, id, title, stage: "input", sourceMode: "image", assets: {}, body: { sections: [] } });
test("W22: 요약 함수는 회원·익명이 직접 부를 수 없고 서버 저장은 계속 요약을 만든다", async () => {
  const db = await supabaseLikeDb();
  try {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query("select public.pdp_document_summary($1::jsonb)", [JSON.stringify({ title: "x" })]), /permission denied/);
      await db.exec("reset role");
    }
    const acl = (await db.query("select proacl::text acl from pg_proc where proname='pdp_document_summary'")).rows[0].acl;
    assert.doesNotMatch(acl, /(^|[{,])(anon|authenticated)?=X/);
    await db.exec("set role service_role");
    const id = "66666666-6666-4666-8666-666666666666", call = writeAs(db, U, id);
    assert.equal((await call("create")).status, 200);
    assert.equal((await call("save", { baseRevision: 0, document: plainDoc(id, "요약"), requestId: crypto.randomUUID() })).status, 200);
    assert.equal((await db.query("select summary->>'title' t from pdp_documents where id=$1", [id])).rows[0].t, "요약");
  } finally { await db.close(); }
});
test("W17: 더 새 보관 지점이 5개면 옛 버전 보관 요청은 200 대신 409 이고 아무것도 바꾸지 않는다", async () => {
  const db = await supabaseLikeDb();
  try {
    await db.exec("set role service_role");
    const id = "77777777-7777-4777-8777-777777777777", call = writeAs(db, U, id);
    await call("create");
    for (let i = 0; i < 10; i++) await call("save", { baseRevision: i, document: plainDoc(id, String(i)), requestId: crypto.randomUUID() });
    const pinned = async () => (await db.query("select revision from pdp_document_revisions where document_id=$1 and pinned order by revision", [id])).rows.map(r => r.revision);
    for (const revision of [6, 7, 8, 9, 10]) assert.equal((await call("pin", { revision })).status, 200);
    assert.deepEqual(await pinned(), [6, 7, 8, 9, 10]);
    assert.equal((await call("pin", { revision: 2 })).status, 409);
    assert.deepEqual(await pinned(), [6, 7, 8, 9, 10]);
    assert.equal((await call("pin", { revision: 99 })).status, 404);
    assert.equal((await call("pin", { revision: 9 })).status, 200);
    assert.deepEqual(await pinned(), [6, 7, 8, 9, 10]);
  } finally { await db.close(); }
});
test("W8·W18: 사본의 원래 회원은 서버가 적고 정리하면 지운다, 정리 시도 시각 칸은 서버만 고친다", async () => {
  const db = await supabaseLikeDb();
  try {
    await db.exec("set role service_role");
    const copy = "88888888-8888-4888-8888-888888888888", plain = "99999999-9999-4999-8999-999999999999";
    assert.equal((await writeAs(db, ADMIN, copy)("create", { copiedFromOwner: U })).record.copied_from_owner, U);
    assert.equal((await writeAs(db, ADMIN, plain)("create", { sourceDraftId: "legacy" })).record.copied_from_owner, null);
    await writeAs(db, ADMIN, copy)("save", { baseRevision: 0, document: plainDoc(copy, "사본"), requestId: crypto.randomUUID() });
    assert.equal((await writeAs(db, ADMIN, copy)("delete")).status, 200);
    assert.equal((await writeAs(db, ADMIN, copy)("purge")).record.copied_from_owner, null);
    await db.query("update pdp_documents set cleanup_attempted_at=now() where id=$1", [plain]);
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${ADMIN}';`);
    await assert.rejects(db.exec("update pdp_documents set cleanup_attempted_at=null, copied_from_owner=null"));
  } finally { await db.close(); }
});
// 최종 리뷰 M1. 문서가 한 번이라도 가졌던 섹션 그림 지문(sha1 앞 8자리)을 서버가 저장 때 더한다.
test("M1: 가졌던 그림 지문은 서버만 더하고(요청 값 무시), 복원으로 빠진 것도 남기며, 한도·정리·회원 차단을 지킨다", async () => {
  const db = await supabaseLikeDb();
  try {
    await db.exec("set role service_role");
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", call = writeAs(db, U, id);
    const asset = (tag) => ({ legacyHash: tag + "0".repeat(32) });
    const docOf = (tags, extra = []) => ({ schemaVersion: 3, id, title: "t", stage: "editor", sourceMode: "image",
      assets: Object.fromEntries([...tags.map((tag, i) => [`x${i}`, asset(tag)]), ...extra.map((tag, i) => [`r${i}`, asset(tag)])]),
      body: { sections: tags.map((_, i) => ({ section_id: `s${i}`, generatedImage: { $asset: `x${i}`, format: "dataUrl" } })) } });
    const held = async () => (await db.query("select held_image_tags h from pdp_documents where id=$1", [id])).rows[0].h;
    let revision = 0;
    const save = async (document, extra = {}) => {
      const result = await call("save", { baseRevision: revision, document, requestId: crypto.randomUUID(), ...extra });
      assert.equal(result.status, 200); revision += 1; return result;
    };
    await call("create");
    assert.deepEqual(await held(), []);
    const first = await save(docOf(["aaaaaaa1"]), { heldImageTags: ["fffffff1"] });
    assert.deepEqual(first.record.held_image_tags, ["aaaaaaa1"]);
    await save(docOf(["aaaaaaa1"], ["eeeeeee1"])); // 글자만 고침 + 섹션에 안 걸린 첨부 그림
    assert.deepEqual(await held(), ["aaaaaaa1"]);
    await save(docOf(["bbbbbbb1", "aaaaaaa2"]));
    assert.deepEqual(await held(), ["aaaaaaa1", "bbbbbbb1", "aaaaaaa2"]);
    await save(docOf(["aaaaaaa1"])); // 복원 = 예전 내용을 새 버전으로 저장
    assert.deepEqual(await held(), ["bbbbbbb1", "aaaaaaa2", "aaaaaaa1"]);
    const tag = (n) => n.toString(16).padStart(8, "0");
    for (let start = 0; start < 510; start += 30) await save(docOf(Array.from({ length: 30 }, (_, i) => tag(start + i))));
    await save(docOf([tag(0)]));
    const capped = await held();
    assert.equal(capped.length, 500);
    assert.equal(capped.at(-1), tag(0));
    assert.ok(!capped.includes(tag(1)) && !capped.includes("aaaaaaa1") && capped.includes(tag(509)));
    await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${U}';`);
    await assert.rejects(db.exec("update pdp_documents set held_image_tags='{}'"));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query("select public.pdp_held_image_tags('{}'::text[], '{}'::jsonb)"), /permission denied/);
    }
    await db.exec("reset role");
    const acl = (await db.query("select proacl::text acl from pg_proc where proname='pdp_held_image_tags'")).rows[0].acl;
    assert.doesNotMatch(acl, /(^|[{,])(anon|authenticated)?=X/);
    await db.exec("set role service_role");
    assert.equal((await call("delete")).status, 200);
    assert.deepEqual((await call("purge")).record.held_image_tags, []);
  } finally { await db.close(); }
});

// 최종 리뷰 2차: 마이그레이션 버전(파일 이름 앞 숫자)이 다른 파일과 겹치면 `supabase db push` 가 부딪힌다.
test("마이그레이션 버전은 이 파일만 쓰고, 맨 위에 한 번만 실행한다는 안내가 있다", async () => {
  const dir = new URL("../../supabase/migrations/", import.meta.url), name = "202610030001_pdp_documents.sql";
  const versions = (await readdir(dir)).filter((file) => file.endsWith(".sql")).map((file) => file.split("_")[0]);
  assert.equal(versions.filter((version) => version === name.split("_")[0]).length, 1);
  const [first] = (await readFile(new URL(name, dir), "utf8")).split(/\r?\n/);
  assert.match(first, /^-- 한 번만 실행한다\. 다시 실행하면 첫 문장에서 실패하고 전부 되돌려진다\. 실행 전 `select to_regclass\('public\.pdp_documents'\)` 가 null 인지 확인\.$/);
});
test("안내대로: 이미 적용한 DB 에 다시 실행하면 첫 문장에서 실패하고 아무것도 바꾸지 않는다", async () => {
  const db = await supabaseLikeDb();
  try {
    await db.exec("set role service_role");
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", call = writeAs(db, U, id);
    await call("create");
    await call("save", { baseRevision: 0, document: plainDoc(id, "남아야 할 문서"), requestId: crypto.randomUUID() });
    await db.exec("reset role");
    assert.notEqual((await db.query("select to_regclass('public.pdp_documents') r")).rows[0].r, null);
    await assert.rejects(db.exec(await readFile(new URL("../../supabase/migrations/202610030001_pdp_documents.sql", import.meta.url), "utf8")),
      /function "pdp_document_summary" already exists/);
    await db.exec("rollback");
    const rows = (await db.query("select revision, document->>'title' t from pdp_documents")).rows;
    assert.deepEqual(rows, [{ revision: 1, t: "남아야 할 문서" }]);
  } finally { await db.close(); }
});
