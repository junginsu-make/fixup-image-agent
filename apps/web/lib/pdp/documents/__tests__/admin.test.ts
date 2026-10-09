import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {adminDocumentHandlers} from "../admin";
import {createLocalDocumentRepository} from "../local-repository";
import {assetPath} from "../model";
const owner="11111111-1111-4111-8111-111111111111",admin="22222222-2222-4222-8222-222222222222";
const id="33333333-3333-4333-8333-333333333333",target="44444444-4444-4444-8444-444444444444",roots:string[]=[];
function setup(allowed=true){
  const root=mkdtempSync(join(tmpdir(),"pdp-admin-"));roots.push(root);const repo=createLocalDocumentRepository(root),uploaded=new Set<string>();
  const storage={urls:vi.fn(async()=>({})),exists:async(a:{path:string})=>uploaded.has(a.path),uploadTicket:vi.fn(),
    removeAll:vi.fn(),copy:vi.fn(async(_a:unknown,b:{path:string})=>{uploaded.add(b.path);})};
  const h=adminDocumentHandlers({enabled:()=>true,authenticate:async()=>allowed?{userId:admin}:Response.json({ok:false},{status:403}),repo,storage});
  return {repo,storage,h};
}
afterEach(()=>{for(const r of roots.splice(0)){if(!r.startsWith(join(tmpdir(),"pdp-admin-")))throw Error("unsafe");rmSync(r,{recursive:true,force:true});}});
describe("관리자의 서버 문서 열람과 복사",()=>{
  it("관리자가 아니면 숨기고 서명을 하지 않는다",async()=>{
    const {h,storage}=setup(false);expect((await h.get(new Request("http://local/?owner="+owner),id)).status).toBe(404);
    expect(storage.urls).not.toHaveBeenCalled();
  });
  it("파일을 먼저 내 경로로 복사한 후 내 문서를 저장한다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);
    const asset={sha256:"a".repeat(64),bytes:20,mimeType:"image/png" as const,path:assetPath(owner,id,"a".repeat(64),"image/png")};
    await repo.save(owner,id,0,{schemaVersion:3,id,title:"원본",stage:"input",sourceMode:"image",assets:{a:asset},body:{sections:[]}},crypto.randomUUID());
    const req=()=>new Request("http://local/",{method:"POST",body:JSON.stringify({ownerId:owner,targetId:target,revision:1})});
    expect((await h.copy(req(),id)).status).toBe(200);
    expect((await repo.get(admin,target))?.document?.assets.a.path).toBe(assetPath(admin,target,asset.sha256,asset.mimeType));
    expect((await repo.get(owner,id))?.revision).toBe(1);
    expect((await h.copy(req(),id)).status).toBe(200);expect(storage.copy).toHaveBeenCalledTimes(1);
    await repo.markDeleted(owner,id);await repo.finishDelete(owner,id);
    expect((await h.copy(req(),id)).status).toBe(200);
    expect(storage.copy).toHaveBeenCalledTimes(1);
    expect(await repo.get(owner,target)).toBeNull();
  });
  it("복사 완료 응답만으로 판단하지 않고 대상 파일을 확인한다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);
    const asset={sha256:"b".repeat(64),bytes:20,mimeType:"image/png" as const,path:assetPath(owner,id,"b".repeat(64),"image/png")};
    await repo.save(owner,id,0,{schemaVersion:3,id,title:"원본",stage:"input",sourceMode:"image",assets:{b:asset},body:{sections:[]}},crypto.randomUUID());
    storage.copy.mockImplementationOnce(async()=>{});
    const response=await h.copy(new Request("http://local/",{method:"POST",
      body:JSON.stringify({ownerId:owner,targetId:target,revision:1})}),id);
    expect(response.status).toBe(503);
    expect((await repo.get(admin,target))?.document).toBeNull();
  });
});

/**
 * **관리자는 회원이 지운 문서도 본다**(2026-10-08 사용자 결정). 목록에는 「지운 때」가 함께 오고, 열어 볼 수 있다.
 * 완전 삭제는 관리자만 — 연결된 옛 그림·파일까지 지우고 문서를 비운다(예전 회원 지우기와 같은 정리).
 */
describe("관리자 — 회원이 지운 문서",()=>{
  const doc=()=>({schemaVersion:3,id,title:"작업",stage:"input",sourceMode:"image",assets:{},
    body:{sections:[],inputs:{},settings:{},references:[],blueprint:{},editor:null}}) as never;
  it("목록에 지운 문서도 지운 때와 함께 싣는다",async()=>{
    const {h,repo}=setup();await repo.create(owner,id);await repo.save(owner,id,0,doc(),crypto.randomUUID());
    await repo.softDelete(owner,id);
    const body=await (await h.list()).json();
    expect(body.documents.map((d:{id:string;deletedAt?:string})=>[d.id,Boolean(d.deletedAt)])).toEqual([[id,true]]);
  });
  it("지운 문서를 열어 본다",async()=>{
    const {h,repo}=setup();await repo.create(owner,id);await repo.save(owner,id,0,doc(),crypto.randomUUID());
    await repo.softDelete(owner,id);
    expect((await h.get(new Request("http://local/?owner="+owner),id)).status).toBe(200);
  });
  it("완전 삭제는 옛 그림·파일까지 정리하고 문서를 비운다",async()=>{
    const {repo,storage}=setup();await repo.create(owner,id,"legacy");await repo.save(owner,id,0,doc(),crypto.randomUUID());
    await repo.softDelete(owner,id);
    const cleanupLegacy=vi.fn(async()=>{});
    const h=adminDocumentHandlers({enabled:()=>true,authenticate:async()=>({userId:admin}),repo,storage,cleanupLegacy} as never);
    expect((await h.remove(new Request("http://local/?owner="+owner),id)).status).toBe(200);
    expect(cleanupLegacy).toHaveBeenCalledWith(owner,[id,"legacy"]);
    expect(storage.removeAll).toHaveBeenCalledWith(owner,id);
    expect((await repo.get(owner,id,undefined,{includeDeleted:true}))?.document).toBeNull();
  });
  it("살아 있는 문서도 관리자는 완전히 지운다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);await repo.save(owner,id,0,doc(),crypto.randomUUID());
    expect((await h.remove(new Request("http://local/?owner="+owner),id)).status).toBe(200);
    expect(storage.removeAll).toHaveBeenCalledWith(owner,id);
  });
  it("관리자가 아니면 완전 삭제하지 못한다",async()=>{
    const {h,repo,storage}=setup(false);await repo.create(owner,id);
    expect((await h.remove(new Request("http://local/?owner="+owner),id)).status).toBe(404);
    expect(storage.removeAll).not.toHaveBeenCalled();
  });
});

/**
 * **관리자는 남의 상세페이지도 지운다**(2026-10-09 사용자 — 9843ohs·ai.dev 는 모든 결과물을 보고 지울 수 있어야 한다).
 * 회원 주소는 자기 문서만 찾으므로 관리자 주소에 주인을 실어 보낸다. 회원이 지울 때와 같이 그림 파일까지 지운다.
 */
describe("관리자의 상세페이지 지우기",()=>{
  const del=(query:string)=>new Request("http://local/"+query,{method:"DELETE"});
  it("관리자가 아니면 아무것도 지우지 않는다",async()=>{
    const {h,repo,storage}=setup(false);await repo.create(owner,id);
    expect((await h.remove(del("?owner="+owner),id)).status).not.toBe(200);
    expect(storage.removeAll).not.toHaveBeenCalled();
    expect(await repo.get(owner,id)).not.toBeNull();
  });
  it("주인의 문서를 그림 파일까지 지운다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);
    expect((await h.remove(del("?owner="+owner),id)).status).toBe(200);
    expect(storage.removeAll).toHaveBeenCalledWith(owner,id);
    expect(await repo.get(owner,id)).toBeNull();
  });
  it("주인이 없거나 틀린 형식이면 400 — 아무것도 지우지 않는다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);
    expect((await h.remove(del(""),id)).status).toBe(400);
    expect((await h.remove(del("?owner=x"),id)).status).toBe(400);
    expect(storage.removeAll).not.toHaveBeenCalled();
  });
  it("옛 라이브러리 그림도 주인 기준으로 정리한다",async()=>{
    const {repo,storage}=setup();await repo.create(owner,id,"legacy");
    const cleanupLegacy=vi.fn(async()=>{});
    const h=adminDocumentHandlers({enabled:()=>true,authenticate:async()=>({userId:admin}),repo,storage,cleanupLegacy} as any);
    expect((await h.remove(del("?owner="+owner),id)).status).toBe(200);
    expect(cleanupLegacy).toHaveBeenCalledWith(owner,[id,"legacy"]);
  });
  it("주인을 틀리게 보내면 404 — 남의 문서를 지우지 않는다",async()=>{
    const {h,repo,storage}=setup();await repo.create(owner,id);
    expect((await h.remove(del("?owner="+target),id)).status).toBe(404);
    expect(storage.removeAll).not.toHaveBeenCalled();
    expect(await repo.get(owner,id)).not.toBeNull();
  });
  it("없는 문서는 404",async()=>{
    const {h,storage}=setup();
    expect((await h.remove(del("?owner="+owner),id)).status).toBe(404);
    expect(storage.removeAll).not.toHaveBeenCalled();
  });
});

/** 운영 연결 — 관리자 지우기도 옛 라이브러리 그림 정리를 받는다. 빠지면 문서만 비고 옛 그림 줄·파일이 남는다(리뷰). */
describe("관리자 지우기 연결",()=>{
  it("관리자 처리기에 옛 라이브러리 정리를 넘긴다",()=>{
    const source=readFileSync(join(__dirname,"..","index.ts"),"utf8");
    const admin=source.slice(source.indexOf("export function createAdminDocumentHandlers"));
    expect(admin).toMatch(/cleanupLegacy:async\(userId,ids\)=>\{if\(!isLocalStoreEnabled\(\)\)await deleteDocumentLegacy\(/);
  });
});
