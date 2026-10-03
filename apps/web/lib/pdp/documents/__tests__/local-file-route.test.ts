import {describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({get:vi.fn(),upload:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../../../membership/api",()=>({authenticateApiMember:async()=>({ok:true,member:{userId:"11111111-1111-4111-8111-111111111111"}})}));
vi.mock("../../../local-store",()=>({isLocalStoreEnabled:()=>true,localStoreRoot:()=>"unused"}));
vi.mock("../index",()=>({serverDocumentsEnabled:()=>true}));
vi.mock("../local-repository",()=>({createLocalDocumentRepository:()=>({get:state.get})}));
vi.mock("../storage",()=>({createLocalDocumentStorage:()=>({upload:state.upload})}));
import {PUT} from "../../../../app/api/pdp/documents/[id]/assets/file/route";
describe("로컬 업로드 중 문서 삭제",()=>{
  it("본문을 받는 동안 삭제되면 파일을 쓰기 전에 다시 거절한다",async()=>{
    const id="33333333-3333-4333-8333-333333333333";
    state.get.mockResolvedValueOnce({id}).mockResolvedValueOnce(null);
    const response=await PUT(new Request("http://local/?sha256="+"a".repeat(64)+"&mimeType=image%2Fpng&bytes=4",
      {method:"PUT",body:new Uint8Array([1,2,3,4])}),{params:Promise.resolve({id})});
    expect(response.status).toBe(404);expect(state.upload).not.toHaveBeenCalled();
  });
});
