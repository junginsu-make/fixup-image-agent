import {describe,expect,it,vi} from "vitest";
import {assetPath,type DocumentRecord} from "../model";
const state=vi.hoisted(()=>({get:vi.fn(),find:vi.fn(),list:vi.fn(),urls:vi.fn(),read:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("../index",()=>({serverDocumentsEnabled:()=>true,documentServices:()=>({repo:{get:state.get,find:state.find,list:state.list},
  storage:{urls:state.urls,read:state.read}})}));
import {documentLibraryAdapter} from "../library-adapter";
import {publicationSource} from "../publication";
const user="11111111-1111-4111-8111-111111111111",id="33333333-3333-4333-8333-333333333333";
const asset={path:assetPath(user,id,"a".repeat(64),"image/png"),sha256:"a".repeat(64),bytes:20,mimeType:"image/png" as const};
const row:DocumentRecord={id,userId:user,revision:1,sourceDraftId:null,createdAt:"2026-10-02",updatedAt:"2026-10-02",deletedAt:null,lastRequestId:null,
  document:{schemaVersion:3 as const,id,title:"작업",stage:"editor" as const,sourceMode:"image" as const,assets:{a:asset},
    body:{sections:[{section_id:"s0"}, {section_id:"s1",generatedImage:{$asset:"a",format:"dataUrl"}}],inputs:{},settings:{},blueprint:{}}}};
describe("기존 라이브러리 읽기와 서버 문서 연결",()=>{
  it("그림의 원래 섹션 순번을 유지해 내보내기·첫 화면 게시가 같은 그림을 고른다",async()=>{
    state.get.mockResolvedValue(row);state.urls.mockResolvedValue({"1":"https://signed/image"});
    const adapter=documentLibraryAdapter({userId:user,role:"member"} as never);
    expect(await adapter.images(id)).toEqual([{position:1,mimeType:"image/png",url:"https://signed/image"}]);
    expect(publicationSource(row,1)).toMatchObject({storagePath:asset.path,index:1,bucket:"pdp-documents"});
    expect(publicationSource(row,0)).toBeNull();
  });
  it("일반 회원에게 타인의 서버 문서를 합치지 않는다",async()=>{
    state.get.mockResolvedValue(null);state.find.mockResolvedValue(null);state.list.mockClear().mockResolvedValue([]);
    expect(await documentLibraryAdapter({userId:user,role:"member"} as never).work(id)).toBeNull();
    expect(state.list).not.toHaveBeenCalled();
    expect(state.find).toHaveBeenLastCalledWith(user,id,"sourceDraftId");
  });
  it("정리: 문서 삭제는 확인을 받는 문서 API 만 한다 — 라이브러리 어댑터에 지우는 길이 없다",()=>{
    expect(documentLibraryAdapter({userId:user,role:"member"} as never)).not.toHaveProperty("remove");
  });
  it("F3: 관리자 옛 작업 열기는 단건 조회만 하고 전체 목록을 읽지 않는다",async()=>{
    state.get.mockResolvedValue(null);state.list.mockClear().mockResolvedValue([]);
    state.find.mockImplementation(async(owner,key,field)=>owner===null&&field==="sourceDraftId"?row:null);
    const work=await documentLibraryAdapter({userId:"22222222-2222-4222-8222-222222222222",role:"admin"} as never).work(id);
    expect(work?.id).toBe(row.id);expect(state.list).not.toHaveBeenCalled();
  });
});
