import {mkdtempSync,rmSync} from "node:fs";
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
