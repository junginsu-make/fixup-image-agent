import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **모르는 것과 0원인 것을 가른다**(N-6·N-7, 설계 §7.2·§8.4).
 *
 * 설계 §7.2: 「비용 알 수 없음은 **0원이 아니라 unknown/pending** 이다.」
 * 설계 §8.4: 「최종 비용 기록이 실패한 경우도 **재처리 대상으로 남긴다.**
 *             정산만 완료됐다고 원가 기록까지 완료됐다고 하지 않는다.」
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * `llm_usd: cost.llmUsd ?? 0` 한 줄이 세 가지를 전부 0 으로 만들었다.
 *
 *   ① 정말 0원인 것 (그림만 만든 요청)
 *   ② 제공자가 사용량을 안 준 것
 *   ③ 기록이 실패한 것
 *
 * ③이 제일 나쁘다. **돈은 나갔는데 장부가 0 이고**, 그 요청은 「정산 완료」로
 * 닫혀 아무도 다시 안 본다 — `settled: Boolean(usage)` 가 비용 기록 실패와
 * 무관하게 참이기 때문이다.
 */

vi.mock("server-only", () => ({}));
vi.mock("../../dev-auth", () => ({
  isLocalAuthBypass: false,
  devMemberProfile: { id: "u1" },
  devUsageSummary: {},
}));

/** 비용 update 가 받은 값. 시험이 값으로 잰다. */
let 적힌것: Record<string, unknown> | null = null;
/** 비용 update 가 실패하는가. */
let update실패 = false;

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({
      data: [{ used_units: 1, reserved_units: 0, quota: 100 }],
      error: null,
    }),
    from: () => {
      const self: Record<string, unknown> = {
        update: (payload: Record<string, unknown>) => {
          적힌것 = payload;
          return self;
        },
        eq: () => self,
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ error: update실패 ? { message: "끊겼다" } : null }),
      };
      return self;
    },
  }),
}));

const { finalizeAiUsage, settleAiUsage } = await import("../api");

const 예약 = { userId: "u1", requestId: "r1" };

beforeEach(() => {
  적힌것 = null;
  update실패 = false;
});

describe("비용을 모를 때", () => {
  it("**0원이라고 적지 않는다**", async () => {
    await finalizeAiUsage(예약, true, 1, undefined, { model: "nano-banana", billableImages: 1 });

    expect(적힌것?.cost_state).toBe("unknown");
    // 0 을 적으면 「돈이 안 나갔다」가 된다. 모르는 것은 모른다고 적는다.
    expect(적힌것?.llm_usd).toBeUndefined();
  });

  it("**정말 0원이면 0 이라고 적는다** — 그림만 만든 요청이 그렇다", async () => {
    await finalizeAiUsage(예약, true, 1, undefined, { model: "nano-banana", billableImages: 1, llmUsd: 0 });

    expect(적힌것?.cost_state).toBe("recorded");
    expect(적힌것?.llm_usd).toBe(0);
  });

  it("**값이 있으면 그대로 적는다**", async () => {
    await finalizeAiUsage(예약, true, 1, undefined, { model: "nano-banana", billableImages: 1, llmUsd: 0.042 });

    expect(적힌것?.cost_state).toBe("recorded");
    expect(적힌것?.llm_usd).toBe(0.042);
  });
});

/**
 * **원가 기록이 실패하면 정산 완료라고 하지 않는다**(설계 §8.4).
 *
 * 전에는 기록 실패를 로그에만 남기고 사용량 결과를 그대로 돌려줬다. 부르는
 * 쪽은 그것으로 「정산 끝」을 판정하므로, **돈이 새는 요청이 닫힌 것으로**
 * 표시됐다.
 */
describe("원가 기록이 실패하면", () => {
  it("**정산 결과에 그 사실을 싣는다**", async () => {
    update실패 = true;

    const usage = await finalizeAiUsage(예약, true, 1, undefined, {
      model: "nano-banana", billableImages: 1, llmUsd: 0.05,
    });

    expect(usage?.costRecorded).toBe(false);
  });

  it("**잘 적었으면 그렇게 싣는다**", async () => {
    const usage = await finalizeAiUsage(예약, true, 1, undefined, {
      model: "nano-banana", billableImages: 1, llmUsd: 0.05,
    });

    expect(usage?.costRecorded).toBe(true);
  });

  /**
   * **비용을 안 넘긴 요청은 적을 것이 없다.** 그때까지 「기록 실패」로 보면
   * 재처리 대상이 쓸데없이 는다.
   */
  it("**비용을 안 넘겼으면 실패가 아니다**", async () => {
    const usage = await finalizeAiUsage(예약, true, 1);

    expect(usage?.costRecorded).not.toBe(false);
  });

  /**
   * **사용량 확정은 되돌리지 않는다.** 장부가 조금 비는 것보다 회원의
   * 크레딧이 예약된 채 묶이는 쪽이 훨씬 나쁘다. 이 규칙은 그대로다.
   */
  it("**그래도 사용량은 돌려준다**", async () => {
    update실패 = true;

    const usage = await finalizeAiUsage(예약, true, 1, undefined, {
      model: "nano-banana", billableImages: 1, llmUsd: 0.05,
    });

    expect(usage).toBeTruthy();
    expect(usage?.quota).toBe(100);
  });

  it("**삼키는 갈래도 같은 값을 준다**", async () => {
    update실패 = true;

    const usage = await settleAiUsage(예약, true, 1, undefined, {
      model: "nano-banana", billableImages: 1, llmUsd: 0.05,
    });

    expect(usage?.costRecorded).toBe(false);
  });
});
