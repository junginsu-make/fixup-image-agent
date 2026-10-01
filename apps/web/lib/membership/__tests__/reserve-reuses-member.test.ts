import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **한 요청 안에서 두 번 인증하지 않는다**(설계 2026-09-29 §3.2).
 *
 * 상세페이지·리디자인 라우트는 몸통을 읽으며 한 번(`readPdpRequest`), 크레딧을
 * 잡으며 또 한 번(`reserveAiUsage`) 인증했다. 그때마다 profiles 를 0.2초 왕복으로
 * 다시 읽었다. 이미 인증한 회원을 넘기면 다시 읽지 않는다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ claimsCalls: 0, profileReads: 0 }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => { state.claimsCalls += 1; return { data: { claims: { sub: "u1" } }, error: null }; } },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => {
        state.profileReads += 1;
        return { data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } };
      } }) }),
    }),
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: { allowed: true, usage: { pricing_policy: "image-v2", balance: 5, available: 5, reserved: 0, used: 0 } }, error: null }),
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");

const req = () => new Request("http://local/api/pdp/images", { headers: { "x-idempotency-key": "33333333-3333-4333-8333-333333333333" } });
const plan = { outputs: [], resource: "pdp:analyze" };
const member = { userId: "u1", profile: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } } as never;

beforeEach(() => { vi.stubEnv("CREDIT_LEDGER", "1"); state.claimsCalls = 0; state.profileReads = 0; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("reserveAiUsage", () => {
  it("인증한 회원을 받으면 다시 인증하지 않는다 — profiles 를 다시 읽지 않는다", async () => {
    const result = await reserveAiUsage(req(), "pdp_analyze", 0, plan, member);

    expect(result.ok && result.userId).toBe("u1");
    expect(state.claimsCalls).toBe(0);
    expect(state.profileReads).toBe(0);
  });

  it("안 받으면 지금처럼 스스로 인증한다", async () => {
    const result = await reserveAiUsage(req(), "pdp_analyze", 0, plan);

    expect(result.ok).toBe(true);
    expect(state.claimsCalls).toBe(1);
    expect(state.profileReads).toBe(1);
  });
});
