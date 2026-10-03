import {expect,it,vi} from "vitest";
import {deleteDocumentLegacy} from "../delete-legacy";
const user="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const source="33333333-3333-4333-8333-333333333333";
it("F17: 연결된 내 옛 행과 원본·축소본만 지우며 실패한 파일은 재시도할 행을 남긴다",async()=>{
  let fail=true;
  const items=[{id:"own",user_id:user,source_id:source,tool:"create"},{id:"other",user_id:other,source_id:source,tool:"create"}];
  const files=new Set([user+"/own/a.png",user+"/own/a.thumb.webp",other+"/other/a.png"]);
  const db:any={from:(table:string)=>{
    const filters:Array<(r:any)=>boolean>=[];let deleting=false;
    const q:any={select:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},in:(k:string,v:any[])=>{filters.push(r=>v.includes(r[k]));return q;},
      limit:()=>q,delete:()=>{deleting=true;return q;},
      then:(resolve:any)=>{
        const data=table==="library_items"?items.filter(r=>filters.every(f=>f(r))):[{user_id:user,item_id:"own",path:user+"/own/a.png",thumb_path:user+"/own/a.thumb.webp"}].filter(r=>filters.every(f=>f(r)));
        if(deleting)for(const r of data){const index=items.findIndex(item=>item.id===(r as {id:string}).id);if(index>=0)items.splice(index,1);}
        return Promise.resolve(resolve({data,error:null}));
      }};return q;},
    storage:{from:()=>({remove:vi.fn(async(paths:string[])=>{if(fail)return {error:{message:"offline"}};for(const p of paths)files.delete(p);return {error:null};})})}};
  await expect(deleteDocumentLegacy(db,user,[source])).rejects.toMatchObject({status:503});
  expect(items).toHaveLength(2);
  fail=false;await deleteDocumentLegacy(db,user,[source]);
  expect(items.map(x=>x.id)).toEqual(["other"]);expect([...files]).toEqual([other+"/other/a.png"]);
});
