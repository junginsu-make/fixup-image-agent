import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDocumentRepository } from "../local-repository";
import { documentHandlers } from "../http";
import { assetPath, type ServerDocument } from "../model";
const user="11111111-1111-4111-8111-111111111111", id="33333333-3333-4333-8333-333333333333";
const roots:string[]=[];
const request=(body:unknown,method="POST")=>new Request("http://local/test",{method,body:JSON.stringify(body),headers:{"content-type":"application/json"}});
function setup(){
  const root=mkdtempSync(join(tmpdir(),"pdp-api-"));roots.push(root);
  const repo=createLocalDocumentRepository(root);
  const storage={exists:vi.fn(async()=>true),uploadTicket:vi.fn(async()=>({uploadUrl:"https://storage/upload"})),
    urls:vi.fn(async()=>({})),removeAll:vi.fn(async()=>{}),copy:vi.fn(async()=>{})};
  const h=documentHandlers({enabled:()=>true,authenticate:async()=>({userId:user}),repo,storage});
  return {repo,storage,h};
}
const asset={sha256:"a".repeat(64),mimeType:"image/png" as const,bytes:20,path:assetPath(user,id,"a".repeat(64),"image/png")};
const doc=():ServerDocument=>({schemaVersion:3,id,title:"작업",stage:"input",sourceMode:"image",assets:{a:{...asset}},
  body:{sections:[],inputs:{},settings:{},references:[],blueprint:{},editor:null}});
afterEach(()=>{for(const root of roots.splice(0)){if(!root.startsWith(join(tmpdir(),"pdp-api-")))throw Error("unsafe");rmSync(root,{recursive:true,force:true});}});
describe("문서 API 경계",()=>{
  /**
   * **회원이 지우면 지운 때만 적는다**(2026-10-08 사용자 결정 — 지워도 남겨 관리자가 확인, 6개월 뒤 파기).
   * 회원 화면(목록·열기)에서는 사라지고, 문서·그림·연결된 옛 그림은 그대로 남는다. 목록을 열어도 정리하지 않는다.
   * 연결된 옛 라이브러리 작업에도 지운 때를 적는다 — 안 적으면 주소로 직접 열면 그림이 보인다(리뷰).
   */
  it("회원의 지우기는 문서를 감추기만 하고 그림·옛 그림은 남긴다 — 목록을 열어도 정리하지 않는다",async()=>{
    const {repo,storage}=setup();await repo.create(user,id,"legacy");await repo.save(user,id,0,doc(),crypto.randomUUID());
    const cleanupLegacy=vi.fn(async()=>{});const hideLegacy=vi.fn(async()=>{});
    const h=documentHandlers({enabled:()=>true,authenticate:async()=>({userId:user}),repo,storage,cleanupLegacy,hideLegacy} as any);
    expect((await h.remove(request({},"DELETE"),id)).status).toBe(200);
    expect(await repo.get(user,id)).toBeNull();
    const listed=await (await h.list()).json();
    expect(listed.documents).toEqual([]);
    expect(storage.removeAll).not.toHaveBeenCalled();
    expect(cleanupLegacy).not.toHaveBeenCalled();
    expect(hideLegacy).toHaveBeenCalledWith(user,[id,"legacy"]);
    const kept=await repo.get(user,id,undefined,{includeDeleted:true});
    expect(kept?.deletedAt).toBeTruthy();
    expect(kept?.deletedBy).toBe(user);
  });
  it("F20: 예전 방식으로 지우다 끊긴 문서는 다음 목록 요청이 정리를 마친다",async()=>{
    const {repo,h,storage}=setup();await repo.create(user,id);await repo.save(user,id,0,doc(),crypto.randomUUID());
    await repo.markDeleted(user,id);
    expect((await h.list()).status).toBe(200);
    expect(storage.removeAll).toHaveBeenCalledTimes(1);
    expect((await repo.markDeleted(user,id)).document).toBeNull();
  });
  it.each(["data:image/png;base64,AAAA","A".repeat(4096)])("F19: 임의 src 칸에도 그림 문자열은 넣을 수 없다 (%#)",async src=>{
    const {repo,h}=setup();await repo.create(user,id);const value=doc();
    value.body.editor={layers:[{src}]};
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:value}),id)).status).toBe(400);
  });
  it.each(["toString","constructor","__proto__"])("실제 자산이 아닌 %s 참조는 거절한다",async(key)=>{
    const {h,repo}=setup();await repo.create(user,id);const invalid=doc();
    invalid.assets={};invalid.body.sections=[{section_id:"s",generatedImage:{$asset:key,format:"dataUrl"}}];
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:invalid}),id)).status).toBe(400);
  });
  it("너무 깊은 JSON은 검증기의 재귀 오류 대신 400으로 거절한다",async()=>{
    const {h,repo}=setup();await repo.create(user,id);
    const raw=JSON.stringify({baseRevision:0,requestId:crypto.randomUUID(),document:doc()})
      .replace('"editor":null','"editor":null,"deep":'+"[".repeat(5000)+"0"+"]".repeat(5000));
    const response=await h.put(new Request("http://local/",{method:"PUT",body:raw}),id);
    expect(response.status).toBe(400);
  });
  it("복원 후 서명 발급이 실패해도 같은 요청으로 복원을 재확인한다",async()=>{
    const {h,repo,storage}=setup();await repo.create(user,id);
    await repo.save(user,id,0,doc(),crypto.randomUUID());
    await repo.save(user,id,1,{...doc(),title:"수정"},crypto.randomUUID());
    const body={baseRevision:2,revision:1,requestId:crypto.randomUUID()};
    storage.urls.mockImplementationOnce(async()=>{throw Error("서명 실패");});
    expect((await h.restore(request(body),id)).status).toBe(503);
    expect((await h.restore(request(body),id)).status).toBe(200);
    expect((await repo.get(user,id))?.revision).toBe(3);
    expect((await h.restore(request({...body,revision:2}),id)).status).toBe(400);
  });
  it("섹션이 null인 문서로 전체 목록을 깨뜨릴 수 없다",async()=>{
    const {h,repo}=setup();await repo.create(user,id);const malformed=doc();malformed.body.sections=[null];
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:malformed}),id)).status).toBe(400);
  });
  it("업로드 서명은 세션의 정확한 경로로 발급된다",async()=>{
    const {h,repo,storage}=setup();await repo.create(user,id);storage.exists.mockResolvedValue(false);
    const response=await h.assets(request({sha256:asset.sha256,mimeType:asset.mimeType,bytes:asset.bytes}),id);
    expect(response.status).toBe(200);expect(storage.uploadTicket).toHaveBeenCalledWith(asset);
    expect((await response.json()).uploadUrl).toBe("https://storage/upload");
  });
  it("본문 상한을 넘으면 저장 전에 413을 반환한다",async()=>{
    const {h,repo}=setup();await repo.create(user,id);
    expect((await h.put(request({padding:"x".repeat(1024*1024+5000)}),id)).status).toBe(413);
    expect((await repo.get(user,id))?.revision).toBe(0);
  });
  it("소유 없는 문서·경로는 업로드 서명을 받지 못한다",async()=>{
    const {h,storage}=setup();
    expect((await h.assets(request(asset),id)).status).toBe(404);
    expect(storage.uploadTicket).not.toHaveBeenCalled();
  });
  it("가입 세션의 소유자만 사용하고 경로는 서버가 짓는다",async()=>{
    const {h,repo,storage}=setup();await repo.create(user,id);
    const response=await h.assets(request({sha256:asset.sha256,mimeType:asset.mimeType,bytes:asset.bytes,path:"other/../../bad"}),id);
    expect(response.status).toBe(400);
    expect(storage.uploadTicket).not.toHaveBeenCalled();
  });
  it("base64나 변조된 경로·없는 자산은 저장하지 않는다",async()=>{
    const {h,repo,storage}=setup();await repo.create(user,id);
    const raw=doc();raw.body.generatedImage="data:image/png;base64,AAAA";
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:raw},"PUT"),id)).status).toBe(400);
    const wrong=doc();wrong.assets.a.path=wrong.assets.a.path.replace("/pdp-docs/","/%2e%2e/");
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:wrong},"PUT"),id)).status).toBe(400);
    storage.exists.mockResolvedValue(false);
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:doc()},"PUT"),id)).status).toBe(409);
    expect((await repo.get(user,id))?.revision).toBe(0);
  });
  it("업로드 완료 후 저장, 충돌 409, 과거 버전 복원을 처리한다",async()=>{
    const {h,repo}=setup();await repo.create(user,id);
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:doc()},"PUT"),id)).status).toBe(200);
    expect((await h.put(request({baseRevision:0,requestId:crypto.randomUUID(),document:doc()},"PUT"),id)).status).toBe(409);
    const next=doc();next.title="수정";
    await h.put(request({baseRevision:1,requestId:crypto.randomUUID(),document:next},"PUT"),id);
    expect((await h.restore(request({baseRevision:2,revision:1,requestId:crypto.randomUUID()}),id)).status).toBe(200);
    expect((await repo.get(user,id))?.document?.title).toBe("작업");
    expect((await repo.get(user,id))?.revision).toBe(3);
  });
  it("이미 지운 문서를 다시 지우면 없는 것이다",async()=>{
    const {h,repo}=setup();await repo.create(user,id);
    expect((await h.remove(new Request("http://local/test"),id)).status).toBe(200);
    expect((await h.remove(new Request("http://local/test"),id)).status).toBe(404);
  });
});

describe("회원의 지우기 — 옛 작업 표시가 실패하면",()=>{
  /** 문서를 먼저 지우면 다시 눌러도 문서를 못 찾아 옛 작업이 영영 주소로 열린다. 옛 작업을 먼저 적는다. */
  it("문서도 지우지 않는다 — 다시 누르면 처음부터 한다",async()=>{
    const {repo,storage}=setup();await repo.create(user,id,"legacy");await repo.save(user,id,0,doc(),crypto.randomUUID());
    const hideLegacy=vi.fn(async()=>{throw new Error("x");});
    const h=documentHandlers({enabled:()=>true,authenticate:async()=>({userId:user}),repo,storage,hideLegacy} as any);
    expect((await h.remove(request({},"DELETE"),id)).status).not.toBe(200);
    expect(await repo.get(user,id)).not.toBeNull();
  });
});
