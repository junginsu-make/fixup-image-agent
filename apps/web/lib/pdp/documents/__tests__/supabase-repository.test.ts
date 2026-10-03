import { describe, expect, it, vi } from "vitest";
import { createSupabaseDocumentRepository } from "../supabase-repository";
const user = "11111111-1111-4111-8111-111111111111", id="33333333-3333-4333-8333-333333333333";
function fake() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for(const key of ["select","eq","is","not","order","range","limit"]) chain[key]=vi.fn(()=>chain);
  chain.maybeSingle=vi.fn(async()=>({data:null,error:null}));
  chain.then=vi.fn((done)=>(Promise.resolve({data:[],error:null}).then(done)));
  const db={from:vi.fn(()=>chain),rpc:vi.fn(async()=>({data:{status:404},error:null}))};
  return {db,chain,repo:createSupabaseDocumentRepository(db as never)};
}
describe("원격 문서 저장의 권한 경계",()=>{
  it.each([user,null])("F3: 단건 연결 조회는 전체 목록 대신 출처 조건과 한 건 한도를 쓴다 (%s)",async owner=>{
    const {repo,chain}=fake();await repo.find(owner,id,"sourceDraftId");
    expect(chain.eq).toHaveBeenCalledWith("source_draft_id",id);expect(chain.limit).toHaveBeenCalledWith(1);
    if(owner)expect(chain.eq).toHaveBeenCalledWith("user_id",owner);
    expect(chain.range).not.toHaveBeenCalled();
  });
  it("F5: DB 크기 제약 위반은 413으로 설명한다",async()=>{
    const {repo,db}=fake();
    db.rpc.mockResolvedValueOnce({data:null,error:{code:"23514",message:'violates check constraint "pdp_document_size"'}} as never);
    await expect(repo.create(user,id)).rejects.toMatchObject({status:413,message:expect.stringContaining("너무 큽니다")});
  });
  it("F3: 목록은 본문 없이 저장된 요약 칼럼만 가져온다",async()=>{
    const {repo,chain}=fake();await repo.list(null);
    const fields=chain.select.mock.calls[0][0].split(",");
    expect(fields).not.toContain("*");expect(fields).not.toContain("document");
    expect(fields).toContain("summary");
  });
  it("읽기는 문서 번호·소유자·삭제 여부를 모두 묶는다",async()=>{
    const {repo,chain}=fake(); expect(await repo.get(user,id)).toBeNull();
    expect(chain.eq.mock.calls).toEqual([["id",id],["user_id",user]]);
    expect(chain.is).toHaveBeenCalledWith("deleted_at",null);
  });
  it("회원 목록은 소유자로 좁힌다",async()=>{
    const {repo,chain}=fake(); await repo.list(user);
    expect(chain.eq).toHaveBeenCalledWith("user_id",user);
  });
  it("최신본을 읽어 덮는 대신 요청자가 읽은 버전을 RPC에 전달한다",async()=>{
    const {repo,db}=fake();
    const document={schemaVersion:3 as const,id,title:"작업",sourceMode:"image" as const,stage:"input" as const,assets:{},body:{sections:[]}};
    await expect(repo.save(user,id,7,document,id)).rejects.toMatchObject({status:404});
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenCalledWith("pdp_document_write",{p_user:user,p_id:id,p_action:"save",p_payload:{baseRevision:7,document,requestId:id}});
  });
  it("삭제도 RPC의 소유권 검사로 보낸다",async()=>{
    const {repo,db}=fake(); await expect(repo.markDeleted(user,id)).rejects.toMatchObject({status:404});
    expect(db.rpc).toHaveBeenCalledWith("pdp_document_write",{p_user:user,p_id:id,p_action:"delete",p_payload:{}});
  });
});
