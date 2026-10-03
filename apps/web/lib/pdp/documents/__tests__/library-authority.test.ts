import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {syncPdpDocumentToLibrary} from "../../jobs/library-sync";
describe("문서 저장과 생성의 충돌",()=>{
  it("F11: 문서 저장 전에 창을 닫아도 생성 결과가 플래그와 무관한 라이브러리에 남는다",async()=>{
    const mutate=vi.fn(async()=>"saved-library-item");const deps={localOnly:()=>false,findItems:vi.fn(async()=>[]),
      create:mutate,appendAt:async()=>true,replaceAt:async()=>true,reorder:async()=>true};
    const result=await syncPdpDocumentToLibrary({userId:"u",documentId:"d",pageSectionIds:["s"],mayFork:true,
      images:[{sectionId:"s",image:{base64:"AAAA",mimeType:"image/png"}}]},deps);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({documentId:"d",image:{base64:"AAAA",mimeType:"image/png"}}));
    expect(deps.findItems).toHaveBeenCalledWith("u","d");
    expect(result.covered).toBe(1);
  });
});
