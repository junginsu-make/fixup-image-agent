import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (f: unknown) => f }));
const state = vi.hoisted(() => ({ rows: {} as Record<string, any>, calls: [] as unknown[][], usage: { pricingPolicy: "image-v2", periodStart: "2026-10-01", remaining: 85 } }));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false }));
vi.mock("../server", () => ({ getUsageSummary: vi.fn(async () => state.usage) }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ from: (table: string) => {
 const q = { select: () => q, eq: (k: string, v: string) => { state.calls.push([table,k,v]); return q; },
 lte: (k: string, v: string) => { state.calls.push([table,`${k}<=`,v]); return q; },
 gt: (k: string, v: string) => { state.calls.push([table,`${k}>`,v]); return q; },
 order: (k: string) => { state.calls.push([table,"order",k]); return q; }, limit: () => q,
 single: async () => state.rows[table], maybeSingle: async () => state.rows[table] }; return q;
} }) }));
import { getAccountSummary } from "../account-summary";
beforeEach(() => { state.calls=[]; state.rows={
 user_subscriptions: {data:{plan_id:"basic",status:"active",started_at:"2026-10-02",cancel_at:null}},
 subscription_plans: {data:{id:"basic",name:"Basic",monthly_units:100,price_krw:10000,active:false}},
 subscription_periods: {data:{period:"2026-10-01",starts_at:"2026-10-02",expires_at:"2026-11-01",units:120,paid_amount_krw:12000}},
}; });
/**
 * 2026-10-09: 구독 기간은 달력의 달이 아니라 배정한 날부터 한 달이다. 그래서 「이번 달 1일」로
 * 찾지 않고 **지금을 품은 기간**(시작 ≤ 지금 < 끝)을 찾는다. 같은 날 플랜을 바꾸면 그런 기간이
 * 둘일 수 있어 가장 늦게 시작한 것을 고른다.
 */
it("본인의 지금 기간을 찾고 기본 제공량과 실제 지급을 구분한다",async()=>{
 const s=await getAccountSummary("self");
 expect(s.subscription).toMatchObject({state:"present",plan:{monthlyUnits:100},currentPeriod:{grantedUnits:120,paidKrw:12000}});
 expect(s.usage.remaining).toBe(85);
 expect(state.calls).toContainEqual(["user_subscriptions","user_id","self"]);
 expect(state.calls).toContainEqual(["subscription_periods","user_id","self"]);
 const 시작=state.calls.find(c=>c[0]==="subscription_periods"&&c[1]==="starts_at<=")?.[2] as string;
 const 끝=state.calls.find(c=>c[0]==="subscription_periods"&&c[1]==="expires_at>")?.[2] as string;
 expect(시작,"지금보다 이르게 시작한 기간을 찾지 않는다").toBeTruthy();
 expect(끝,"시작과 끝을 같은 「지금」으로 잰다").toBe(시작);
 expect(Math.abs(Date.parse(시작)-Date.now())).toBeLessThan(5000);
 expect(state.calls).toContainEqual(["subscription_periods","order","starts_at"]);
 expect(state.calls.some(c=>c[1]==="period"),"달력의 달로 찾고 있다").toBe(false);
 expect(state.calls.some(c=>c[1]==="active")).toBe(false);
});
it("지금 기간이 없으면 미지급, 구독이 없으면 없음으로 구별한다",async()=>{
 state.rows.subscription_periods={data:null}; expect((await getAccountSummary("self")).subscription).toMatchObject({state:"present",currentPeriod:null});
 state.rows.user_subscriptions={data:null}; expect((await getAccountSummary("self")).subscription).toEqual({state:"none"});
});
it("구독 조회 실패에도 잔액을 보존하며 미가입으로 표시하지 않는다",async()=>{
 state.rows.subscription_plans={data:null,error:{message:"failed"}};
 const s=await getAccountSummary("self"); expect(s.subscription.state).toBe("unavailable"); expect(s.usage.remaining).toBe(85);
});
