import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const state=vi.hoisted(()=>({fail:false}));
const source="33333333-3333-4333-8333-333333333333";
const rows=Array.from({length:5},(_,i)=>({item_id:"old",position:i,path:"u/old/"+i+"-s12345678-a"+String(i).repeat(8)+".webp",mime_type:"image/webp",user_id:"u"}));
vi.mock("../flags",()=>({serverDocumentsEnabled:()=>true}));
vi.mock("../library-adapter",()=>({documentLibraryAdapter:()=>({
  list:async()=>{if(state.fail)throw Error("문서 서명 실패");return [{id:source,sourceId:source,documentId:source,tool:"create",imageCount:2,imageTags:["00000000","11111111"]}];},
  excluded:async()=>[],images:async()=>null,
  linkedDocument:async()=>({imageTags:["00000000","11111111"]}),
})}));
vi.mock("../../../supabase/admin",()=>({createSupabaseAdminClient:()=>{
  return {from:(table:string)=>{
    const q:any={select:()=>q,eq:()=>q,in:()=>q,is:()=>q,order:()=>q,limit:()=>q,range:()=>q,
      maybeSingle:async()=>({data:{id:"old",source_id:source,tool:"create"},error:null}),
      then:(resolve:any)=>Promise.resolve(resolve({data:table==="library_images"?rows:[{id:"old",user_id:"u",tool:"create",source_id:source,image_count:5,cover_path:rows[0].path}],error:null}))};
    return q;},
    storage:{from:()=>({createSignedUrls:async(paths:string[])=>({data:paths.map(path=>({path,signedUrl:"signed:"+path})),error:null})})}};
}}));
import {listLibraryItems,getLibraryItemImages} from "../../../server-library";
it("F14: 문서 목록만 실패하면 옛 라이브러리 목록은 계속 연다",async()=>{
  state.fail=true;
  try{expect((await listLibraryItems({userId:"u",role:"member"})).map(x=>x.imageCount)).toEqual([5]);}
  finally{state.fail=false;}
});
it("F10: 옛 다섯 장 중 문서와 같은 두 장만 제외하고 나머지 표지·목록·선택을 보존한다",async()=>{
  const viewer={userId:"u",role:"member"} as const;
  const items=await listLibraryItems(viewer);
  expect(items.map(x=>x.imageCount)).toEqual([2,3]);
  expect(items[1].coverUrl).toBe("signed:"+rows[2].path);
  const images=await getLibraryItemImages(viewer,"old");
  expect(images.map(x=>x.position)).toEqual([2,3,4]);
});
