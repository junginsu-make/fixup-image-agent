import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **「새로고침 후 다시 시도해 주세요」가 거짓말이었다**(E-6-2-b).
 *
 * 화면은 같은 섹션을 다시 만들 때 **같은 요청 식별자**를 쓴다
 * (`retryRequestKeysRef`). 두 번 과금되지 않게 하려는 장치다.
 *
 * 그런데 그 식별자로 다시 오면 `reserve_generation` 은 무조건
 * `duplicate_request` 를 돌려주고, 앱은 **한 문장**으로 답했다 —
 * 「이미 처리된 요청입니다. 새로고침 후 다시 시도해 주세요.」
 *
 * 그 한 문장이 **서로 다른 세 상황**을 덮고 있었다.
 *
 * | 표의 상태 | 실제로 일어난 일 | 사용자가 할 일 |
 * |---|---|---|
 * | `reserved` | 아직 돌고 있다(두 번 눌렀다) | **기다린다** |
 * | `succeeded` | 끝났는데 결과가 화면에 못 왔다 | 다시 만들면 **값이 또 나간다** |
 * | `failed` | 실패로 끝났다 | 새로 만들면 된다 |
 *
 * 「새로고침」은 셋 중 무엇도 풀지 못한다. 단건 생성은 결과를 되찾는 길이
 * 아예 없고(일괄만 job 을 남긴다), 그 job 도 `PDP_JOBS_ENABLED` 가 꺼져 있다.
 *
 * 설계 §14.5(E-6-2-b): 「유지하되 … **header 존재 = 결과 복구 아님**」.
 */

vi.mock("server-only", () => ({}));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        single: async () => ({
          data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", monthly_quota: 100 },
        }),
      };
      return self;
    },
  }),
}));
vi.mock("../../dev-auth", () => ({
  isLocalAuthBypass: false,
  devMemberProfile: { id: "u1" },
  devUsageSummary: {},
}));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

/** 예약 RPC 가 돌려줄 값. 시험마다 갈아 끼운다. */
let rpcRow: Record<string, unknown> = {};
/** 표에 남아 있는 그 요청의 행. `null` 이면 못 찾은 것이다. */
let existingRow: Record<string, unknown> | null = null;
/** 표를 몇 번 읽었는지. 중복이 아닐 때 왕복을 걸면 안 된다. */
let 표조회 = 0;

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: [rpcRow], error: null }),
    from: () => {
      표조회 += 1;
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        maybeSingle: async () => ({ data: existingRow, error: null }),
      };
      return self;
    },
  }),
}));

const { reserveAiUsage } = await import("../api");

const 키 = "11111111-1111-4111-8111-111111111111";
const 요청 = () =>
  new Request("http://localhost/api/pdp/images", {
    method: "POST",
    headers: { "x-idempotency-key": 키 },
  });

const 거절 = async () => {
  const result = await reserveAiUsage(요청(), "pdp_image", 1);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("거절되지 않았다");
  return { status: result.response.status, body: await result.response.json() };
};

beforeEach(() => {
  rpcRow = { allowed: false, reason: "duplicate_request", used_units: 0, reserved_units: 0, quota: 100 };
  existingRow = null;
  표조회 = 0;
});

describe("같은 식별자로 다시 오면", () => {
  it("**아직 돌고 있으면 기다리라고 한다**", async () => {
    existingRow = { status: "reserved" };

    const { status, body } = await 거절();

    expect(status).toBe(409);
    expect(body.message).toContain("처리 중");
    // 「새로고침」은 돌고 있는 것을 끝내 주지 않는다.
    expect(body.message).not.toContain("새로고침");
  });

  /**
   * **여기가 제일 나쁘다.** 값은 이미 나갔고 그림도 만들어졌는데 화면에
   * 못 왔다. 「다시 시도」라고 하면 사용자는 **한 번 더 낸다.**
   */
  it("**끝난 요청이면 값이 또 나간다고 말한다**", async () => {
    existingRow = { status: "succeeded" };

    const { body } = await 거절();

    expect(body.message).toContain("이미 끝났");
    expect(body.message).toContain("다시 만들면");
    expect(body.message).not.toContain("새로고침");
  });

  it("**실패로 끝났으면 새로 만들라고 한다**", async () => {
    existingRow = { status: "failed" };

    const { body } = await 거절();

    expect(body.message).toContain("실패");
  });

  /**
   * 표를 못 읽는 날에도 화면은 무언가를 말해야 한다. 다만 **거짓말은 안 한다** —
   * 무엇이 일어났는지 모를 때 「새로고침하면 된다」고 하지 않는다.
   */
  it("**상태를 모르면 단정하지 않는다**", async () => {
    existingRow = null;

    const { body } = await 거절();

    expect(body.message).toBeTruthy();
    expect(body.message).not.toContain("새로고침");
  });

  it("다른 거절 사유는 그대로다", async () => {
    rpcRow = { allowed: false, reason: "quota_exceeded", used_units: 0, reserved_units: 0, quota: 100 };

    const { status, body } = await 거절();

    expect(status).toBe(429);
    expect(body.message).toContain("한도를 모두 사용");
  });

  /**
   * **중복일 때만 표를 한 번 더 읽는다.**
   *
   * 한도에 걸린 것은 표를 안 읽어도 할 말이 정해져 있다. 모든 거절에 왕복을
   * 걸면 가장 자주 나는 거절이 제일 느려진다.
   */
  it("**한도 거절에는 표를 안 읽는다**", async () => {
    rpcRow = { allowed: false, reason: "quota_exceeded", used_units: 0, reserved_units: 0, quota: 100 };

    await 거절();

    expect(표조회).toBe(0);
  });

  it("중복일 때는 읽는다", async () => {
    existingRow = { status: "succeeded" };

    await 거절();

    expect(표조회).toBe(1);
  });
});
