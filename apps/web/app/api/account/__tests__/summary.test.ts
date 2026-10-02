import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({auth:vi.fn(),summary:vi.fn()}));
vi.mock("../../../../lib/membership/api",()=>({authenticateApiMember:state.auth}));
vi.mock("../../../../lib/membership/account-summary",()=>({getAccountSummary:state.summary}));
import {GET} from "../summary/route";
beforeEach(()=>{state.auth.mockReset().mockResolvedValue({ok:true,member:{userId:"self"}});state.summary.mockReset().mockResolvedValue({usage:{remaining:0},subscription:{state:"none"}})});
it("세션 본인만 조회하며 0잔액도 허용한다",async()=>{
 const response=await Reflect.apply(GET,null,[new Request("http://local/api/account/summary?userId=victim")]);
 expect(state.summary).toHaveBeenCalledExactlyOnceWith("self");expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it.each([401,403])("인증에서 거절된 회원은 장부를 읽지 않는다 (%s)",async(status)=>{
 state.auth.mockResolvedValue({ok:false,response:Response.json({ok:false},{status})});
 expect((await GET()).status).toBe(status);expect(state.summary).not.toHaveBeenCalled();
});
it("조회 실패에 0잔액이나 내부 오류를 반환하지 않는다",async()=>{
 state.summary.mockRejectedValue(new Error("private SQL"));
 const response=await GET();expect(response.status).toBe(503); const body=await response.json();expect(body).not.toHaveProperty("usage");expect(JSON.stringify(body)).not.toContain("private SQL");
});
