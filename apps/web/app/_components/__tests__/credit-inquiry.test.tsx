import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation",()=>({usePathname:()=>"/settings"}));
vi.mock("@fixup/ui",()=>({Button:"button"}));
import { CreditInquiry } from "../credit-inquiry";
let tree:ReactTestRenderer;
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());vi.unstubAllGlobals()});
async function open(label:string){await act(async()=>{tree=create(<CreditInquiry/>)});await act(async()=>tree.root.findAllByType("button").find(b=>b.children.includes(label))!.props.onClick())}
it.each([{saved:true,mailed:false},{saved:false,mailed:false,duplicate:true}])("AI 상담 없이 문의를 접수하고 메일 실패/중복을 구별한다 %j",async(result)=>{
 const fetch=vi.fn(async()=>Response.json({ok:true,...result,message:"접수됨"}));vi.stubGlobal("fetch",fetch);
 await open("크레딧 구매 문의");
 expect(fetch).not.toHaveBeenCalled();
 await act(async()=>tree.root.findByType("form").props.onSubmit({preventDefault(){}}));
 expect(fetch).toHaveBeenCalledOnce();
 const [url,init]=fetch.mock.calls[0] as unknown as [string,{body:string}];expect(url).toBe("/api/cs/inquiry");
 const body=JSON.parse(init.body);expect(body.question).toContain("[크레딧 구매 문의]");expect(body).not.toHaveProperty("userId");expect(body).not.toHaveProperty("sessionId");
 expect(JSON.stringify(tree.toJSON())).toContain("접수 완료");
});
it("저장 실패는 입력을 보존하고 성공으로 표시하지 않는다",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({ok:false,message:"잠시 후 다시"},{status:500})));
 await open("월 구독 문의"); const before=tree.root.findByType("textarea").props.value;
 await act(async()=>tree.root.findByType("form").props.onSubmit({preventDefault(){}}));
 expect(tree.root.findByType("textarea").props.value).toBe(before);expect(JSON.stringify(tree.toJSON())).not.toContain("접수 완료");expect(JSON.stringify(tree.toJSON())).toContain("잠시 후 다시");
});
