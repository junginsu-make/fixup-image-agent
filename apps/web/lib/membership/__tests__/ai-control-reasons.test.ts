import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationOperation } from "../types";

/**
 * **크레딧 없음·AI 멈춤을 사용자가 읽는 말로 옮긴다**(설계 2026-09-30 §3.2).
 *
 * 둘 다 다시 눌러도 안 풀린다. 화면(쉬운 만들기)이 「다시 시도」를 안 내도록
 * `retryable: false` 를 싣는다. 옛 사유의 응답 모양은 바꾸지 않는다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ reply: {} as Record<string, unknown> }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self, eq: () => self,
        single: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
        maybeSingle: async () => ({ data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } }),
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
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "u1" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");
const REQUEST = "33333333-3333-4333-8333-333333333333";
const req = () => new Request("http://local/api/x", { headers: { "x-idempotency-key": REQUEST } });

async function refused(operation: GenerationOperation, reason: string) {
  state.reply = { allowed: false, reason, usage: { pricing_policy: "image-v2", balance: 0, available: 0, reserved: 0, used: 0 } };
  const result = await reserveAiUsage(req(), operation, 0, { outputs: [], resource: "test:free" });
  if (result.ok) throw new Error("거절돼야 한다");
  return { status: result.response.status, body: await result.response.json() };
}

beforeEach(() => { process.env.CREDIT_LEDGER = "1"; });

describe("크레딧이 없으면", () => {
  it("403 과 연락처가 든 말을 주고, 다시 눌러도 안 풀린다고 알린다", async () => {
    const { status, body } = await refused("pdp_analyze", "credits_required");
    expect(status).toBe(403);
    expect(body.code).toBe("credits_required");
    expect(body.message).toBe("크레딧이 없어 이 기능을 쓸 수 없습니다. 운영자에게 문의해 주세요(ai.dev@fixupworld.com).");
    expect(body.retryable).toBe(false);
  });

  it("도우미 물음이면 무료 10회를 다 썼다고 말한다", async () => {
    const { status, body } = await refused("cs_ask", "credits_required");
    expect(status).toBe(403);
    expect(body.message).toBe("무료 질문 10회를 모두 썼습니다. 크레딧을 받은 뒤 다시 이용해 주세요.");
    expect(body.retryable).toBe(false);
  });
});

describe("운영자가 멈췄으면", () => {
  it("503 과 멈춤 말을 주고, 다시 눌러도 안 풀린다고 알린다", async () => {
    const { status, body } = await refused("poster_image", "ai_paused");
    expect(status).toBe(503);
    expect(body.code).toBe("ai_paused");
    expect(body.message).toBe("운영자가 AI 사용을 잠시 멈췄습니다. 잠시 후 다시 시도해 주세요.");
    expect(body.retryable).toBe(false);
  });
});

describe("옛 사유는 그대로다", () => {
  it("크레딧 모자람은 429 이고 retryable 칸을 싣지 않는다", async () => {
    const { status, body } = await refused("poster_image", "quota_exceeded");
    expect(status).toBe(429);
    expect(body).not.toHaveProperty("retryable");
  });
});

describe("상세페이지 일괄 만들기", () => {
  /**
   * **남은 섹션을 줄줄이 보내지 않는다.** 크레딧 0 회원은 전에 `quota_exceeded` 로
   * 멈췄다. 이제 사유가 `credits_required` 라, 목록에 없으면 섹션마다 같은 알림이 뜬다.
   */
  it("크레딧 없음·멈춤이면 일괄을 멈춘다", () => {
    const editor = readFileSync(new URL("../../../app/create/PdpEditor.tsx", import.meta.url), "utf8");
    const list = editor.match(/stopBatch: \[([\s\S]*?)\]\.includes\(responseCode\)/);
    expect(list, "stopBatch 목록을 못 찾았다").toBeTruthy();
    expect(list![1]).toContain('"credits_required"');
    expect(list![1]).toContain('"ai_paused"');
  });
});
