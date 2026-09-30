import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **예약이 성공하면 그 요청의 비용 문맥을 채운다**(설계 2026-09-30 §3.4).
 *
 * 공급자 생성 함수의 인자는 안 바꾼다. 대신 라우트 입구의 계량기 저장소에 「누구의
 * 무슨 작업인가」를 싣고, 뒤에서 공급자를 부를 때마다 그것을 붙여 한 줄씩 적는다.
 * 회원이 부르는 유료 AI 는 모두 여기(`reserveAiUsage`)를 지나므로 한 곳에서 채운다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ reply: {} as Record<string, unknown> }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "0f8fad5b-d9cb-469f-a165-70867728950e" } }, error: null }) },
    from: () => {
      const profile = { id: "0f8fad5b-d9cb-469f-a165-70867728950e", email_confirmed_at: "2026-01-01", status: "active", role: "member" };
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self,
        single: async () => ({ data: profile }),
        maybeSingle: async () => ({ data: profile }),
      };
      return self;
    },
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: state.reply, error: null }),
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const { currentAiCaller, withLlmMeter } = await import("../../llm/meter");

const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const req = () => new Request("http://local/api/x", { headers: { "x-idempotency-key": REQUEST } });
const usage = { pricing_policy: "image-v2", balance: 5, available: 5, reserved: 0, used: 0 };

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; });

describe("예약이 성공하면", () => {
  it("회원·요청·작업 키를 문맥에 싣는다 — 작업 키는 resource 에서 id 를 뺀 것", async () => {
    state.reply = { allowed: true, usage };
    const caller = await withLlmMeter(async () => {
      const result = await reserveAiUsage(req(), "sns_image", 0, { outputs: [], resource: `sns:${PROJECT}:plan` });
      expect(result.ok).toBe(true);
      return currentAiCaller();
    });
    expect(caller).toEqual({ userId: USER, requestId: REQUEST, operation: "sns:plan" });
  });
});

describe("예약이 거절되면", () => {
  it("문맥을 채우지 않는다 — 거절된 요청은 공급자를 안 부른다", async () => {
    state.reply = { allowed: false, reason: "ai_paused", usage };
    const caller = await withLlmMeter(async () => {
      await reserveAiUsage(req(), "sns_image", 0, { outputs: [], resource: `sns:${PROJECT}:plan` });
      return currentAiCaller();
    });
    expect(caller).toBeUndefined();
  });
});
