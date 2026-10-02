import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/settings" }));
vi.mock("@fixup/ui", () => ({ Badge: "span", Button: "button" }));
vi.mock("lucide-react", () => ({ LogOut: () => null }));
import { CreditPolicyProvider } from "../credit-policy-provider";
import { StudioActions } from "../studio-actions";
const usage = (remaining: number) => ({ pricingPolicy: "image-v2" as const, remaining, used: 0, reserved: 0, quota: remaining, periodStart: "2026-10-01", periodEnd: "2026-11-01" });
let tree: ReactTestRenderer;
afterEach(async () => { if(tree) await act(async()=>tree.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("서버에서 새로 확인한 잔액을 상단에 표시한다", async () => {
 const bus = new EventTarget();
 vi.stubGlobal("window", bus); vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
 vi.stubGlobal("BroadcastChannel", undefined);
 vi.stubGlobal("fetch", vi.fn(async () => Response.json({ usage: usage(100), subscription: { state: "none" }, fetchedAt: "now" })));
 const render = (n: number) => <CreditPolicyProvider usage={usage(n)}><StudioActions email="review@example.invalid" usage={usage(n)} /></CreditPolicyProvider>;
 await act(async () => { tree = create(render(0)); });
 await act(async () => { tree.update(render(100)); });
 expect(JSON.stringify(tree.toJSON())).toContain("100크레딧 남음");
});


it("늦은 props와 기존 usage 이벤트의 숫자는 서버 잔액을 덮지 않는다", async () => {
 vi.useFakeTimers(); const bus = new EventTarget();
 vi.stubGlobal("window", bus); vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" })); vi.stubGlobal("BroadcastChannel", undefined);
 const read=vi.fn(async()=>Response.json({usage:usage(99),subscription:{state:"none"},fetchedAt:"now"})); vi.stubGlobal("fetch",read);
 const view=(n:number)=><CreditPolicyProvider userId="one" usage={usage(n)}><StudioActions email="a" usage={usage(n)}/></CreditPolicyProvider>;
 await act(async()=>{tree=create(view(0));});
 await act(async()=>{tree.update(view(1));});
 await act(async()=>{bus.dispatchEvent(new CustomEvent("studio-usage-updated",{detail:usage(999)}));await vi.advanceTimersByTimeAsync(1000);});
 expect(JSON.stringify(tree.toJSON())).toContain("99크레딧 남음");expect(JSON.stringify(tree.toJSON())).not.toContain("999크레딧");
});
it("숨은 탭에서는 주기 조회를 멈추고 다시 보이면 확인한다",async()=>{
 vi.useFakeTimers();const bus=new EventTarget(),doc=Object.assign(new EventTarget(),{visibilityState:"hidden"});
 vi.stubGlobal("window",bus);vi.stubGlobal("document",doc);vi.stubGlobal("BroadcastChannel",undefined);
 const read=vi.fn(async()=>Response.json({usage:usage(7),subscription:{state:"none"}}));vi.stubGlobal("fetch",read);
 await act(async()=>{tree=create(<CreditPolicyProvider userId="one" usage={usage(0)}><StudioActions email="a" usage={usage(0)}/></CreditPolicyProvider>)});
 await act(async()=>{await vi.advanceTimersByTimeAsync(120000);});expect(read).toHaveBeenCalledTimes(1);
 await act(async()=>{doc.visibilityState="visible";doc.dispatchEvent(new Event("visibilitychange"));});expect(read).toHaveBeenCalledTimes(2);
});
it("회원 전환 후 이전 회원의 늦은 응답은 표시하지 않는다",async()=>{
 const bus=new EventTarget();vi.stubGlobal("window",bus);vi.stubGlobal("document",Object.assign(new EventTarget(),{visibilityState:"visible"}));vi.stubGlobal("BroadcastChannel",undefined);
 let resolve!:(r:Response)=>void;const old=new Promise<Response>(r=>{resolve=r;});
 vi.stubGlobal("fetch",vi.fn().mockReturnValueOnce(old).mockResolvedValue(Response.json({usage:usage(7),subscription:{state:"none"}})));
 const view=(id:string,n:number)=><CreditPolicyProvider userId={id} usage={usage(n)}><StudioActions email={id} usage={usage(n)}/></CreditPolicyProvider>;
 await act(async()=>{tree=create(view("old",100));});await act(async()=>{tree.update(view("new",7));});
 await act(async()=>{resolve(Response.json({usage:usage(999),subscription:{state:"none"}}));});
 expect(JSON.stringify(tree.toJSON())).toContain("7크레딧 남음");expect(JSON.stringify(tree.toJSON())).not.toContain("999크레딧");
});
