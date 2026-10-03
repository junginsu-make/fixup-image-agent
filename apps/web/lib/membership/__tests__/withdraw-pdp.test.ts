import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const s=vi.hoisted(()=>({files:new Set<string>(),rows:[] as any[],events:[] as string[],fail:false,close:true}));
vi.mock("../../supabase/admin",()=>({createSupabaseAdminClient:()=>({
  from:(table:string)=>{
    let owner="",patch:any,del=false;
    const q:any={select:()=>q,eq:(_k:string,v:string)=>{owner=v;return q;},gt:()=>q,limit:()=>q,
      update:(value:any)=>{patch=value;return q;},delete:()=>{del=true;return q;},
      single:async()=>({data:{status:"active"},error:null}),
      then:(resolve:any)=>{
        if(table==="pdp_documents"&&patch){s.events.push(patch.deleted_at?"mark":"purge");for(const r of s.rows)if(r.user_id===owner)Object.assign(r,patch);}
        if(table==="pdp_document_revisions"&&del)s.events.push("revisions");
        return Promise.resolve(resolve({data:[],error:null}));
      }};
    return q;
  },
  rpc:async(name:string)=>{s.events.push(name);return {data:s.close,error:null};},
  auth:{admin:{deleteUser:async()=>{s.events.push("deleteUser");return {error:null};}}},
  storage:{from:(bucket:string)=>({
    list:async(prefix:string,{offset=0,limit=1000}:any={})=>{
      if(bucket!=="pdp-documents")return {data:[],error:null};
      s.events.push("list:"+prefix);
      if(s.fail)return {data:null,error:{message:"offline"}};
      const names=[...new Set([...s.files].filter(p=>p.startsWith(prefix+"/")).map(p=>p.slice(prefix.length+1).split("/")[0]))];
      return {data:names.slice(offset,offset+limit).map(name=>({name,id:s.files.has(prefix+"/"+name)?name:null})),error:null};
    },
    remove:async(paths:string[])=>{for(const p of paths)s.files.delete(p);s.events.push("remove");return {error:null};},
  })},
})}));
import {withdrawAccount} from "../withdraw-account";
beforeEach(()=>{
  s.files=new Set(["u1/pdp-docs/d/a.png","u2/pdp-docs/d/b.png"]);s.fail=false;s.close=true;s.events=[];
  s.rows=[{user_id:"u1",document:{secret:true},deleted_at:null,held_image_tags:["aaaaaaa1"]},{user_id:"u2",document:{secret:true},deleted_at:null,held_image_tags:["bbbbbbb1"]}];
});
it.each([true,false])("F4: 탈퇴(close=%s)는 내 문서를 먼저 숨기고 내 원본만 없앤다",async close=>{
  s.close=close;expect((await withdrawAccount("u1","")).ok).toBe(true);
  expect([...s.files]).toEqual(["u2/pdp-docs/d/b.png"]);
  expect(s.rows[0]).toMatchObject({document:null,deleted_at:expect.any(String),held_image_tags:[]});
  expect(s.rows[1]).toMatchObject({document:{secret:true},deleted_at:null,held_image_tags:["bbbbbbb1"]});
  expect(s.events.indexOf("mark")).toBeLessThan(s.events.indexOf("list:u1"));
});
it("F4: 상세페이지 파일 목록 실패를 탈퇴 성공으로 숨기지 않는다",async()=>{
  s.fail=true;expect((await withdrawAccount("u1","")).ok).toBe(false);
  expect(s.events).not.toContain("member_withdraw");expect(s.events).not.toContain("deleteUser");
  expect(s.files.has("u1/pdp-docs/d/a.png")).toBe(true);
});
