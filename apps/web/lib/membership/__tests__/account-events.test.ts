import { afterEach, expect, it, vi } from "vitest";
import { ACCOUNT_CHANGED, CREDIT_SHORTAGE, observeAccountResponse } from "../account-events";
import { read } from "../../easy/relay";
afterEach(()=>vi.unstubAllGlobals());
it("업무 코드로만 구매 안내를 열고 fal/팀/동시 제한에는 열지 않는다",()=>{
 const bus=new EventTarget();vi.stubGlobal("window",bus);const changed=vi.fn(),shortage=vi.fn();
 bus.addEventListener(ACCOUNT_CHANGED,changed);bus.addEventListener(CREDIT_SHORTAGE,shortage);
 for(const code of ["credits_required","quota_exceeded"]) observeAccountResponse({code,message:"부족"});
 expect(shortage).toHaveBeenCalledTimes(2);
 for(const code of ["team_quota_exceeded","concurrent_limit","ai_paused","fal_error"]) observeAccountResponse({code,message:"부족",status:429});
 expect(shortage).toHaveBeenCalledTimes(2);
});
it("진행 중 폴링에는 추가 조회가 없고 완료와 접수에서만 갱신한다",()=>{
 const bus=new EventTarget();vi.stubGlobal("window",bus);const changed=vi.fn();bus.addEventListener(ACCOUNT_CHANGED,changed);
 observeAccountResponse({ok:true,active:true}); observeAccountResponse({ok:true,done:false});
 expect(changed).not.toHaveBeenCalled();
 observeAccountResponse({ok:true,active:false}); observeAccountResponse({ok:true},true); expect(changed).toHaveBeenCalledTimes(2);
});
it("Easy 중계가 부족 코드와 재시도 금지, 잔액을 보존한다",async()=>{
 const usage={remaining:1,used:4,reserved:0};
 await expect(read(Response.json({ok:false,code:"quota_exceeded",usage,message:"부족"},{status:429}),"생성")).rejects.toMatchObject({code:"quota_exceeded",usage,retryable:false,status:429});
});
