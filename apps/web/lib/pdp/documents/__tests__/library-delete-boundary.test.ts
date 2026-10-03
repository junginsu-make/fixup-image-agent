import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({document:true,assets:true,revisions:true}));
vi.mock("server-only",()=>({}));
vi.mock("../flags",()=>({serverDocumentsEnabled:()=>true}));
vi.mock("../library-adapter",()=>({documentLibraryAdapter:()=>({
  remove:async()=>{state.document=false;state.assets=false;state.revisions=false;return true;},
})}));
vi.mock("../../../supabase/admin",()=>({createSupabaseAdminClient:()=>{
  const query:any={select:()=>query,eq:()=>query,delete:()=>query,
    then:(resolve:any)=>Promise.resolve(resolve({data:[],error:null}))};
  return {from:()=>query};
}}));
vi.mock("../../../membership/api",()=>({authenticateApiMember:async()=>({ok:true,
  member:{userId:"11111111-1111-4111-8111-111111111111",profile:{role:"member"}}})}));
vi.mock("../../../teams/store",()=>({teamIdOf:async()=>null}));
vi.mock("../../../teams/current-project",()=>({selectedProjectFor:async()=>null}));
import {DELETE} from "../../../../app/api/library/route";
beforeEach(()=>Object.assign(state,{document:true,assets:true,revisions:true}));
it("F1: 일반 라이브러리 삭제는 서버 문서·그림·이전 버전을 지우지 않는다",async()=>{
  await DELETE(new Request("http://localhost/api/library",{method:"DELETE",
    body:JSON.stringify({id:"33333333-3333-4333-8333-333333333333"})}));
  expect(state).toEqual({document:true,assets:true,revisions:true});
});
