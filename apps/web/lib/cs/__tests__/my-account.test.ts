import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **내 계정만 읽는가**(2026-09-23 사용자 요구, 설계 §4).
 *
 * > 다른 계정에 대한 답은 절대 하면 안되기도 하고요.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 문장으로 옮기는 일은 `account-facts.test.ts` 가 잰다. 여기는 **무엇을
 * 데이터베이스에 묻는가**다 — 어느 회원으로 묻는지, 안 물어본 것을 읽는지.
 */

vi.mock("server-only", () => ({}));

/** 데이터베이스에 실제로 보낸 것. */
const 물어본것: Array<{ table: string; filters: Record<string, unknown> }> = [];
let 실패읽기오류: { message: string } | null = null;
let 구독: { plan_id: string; status: string } | null = { plan_id: "basic", status: "active" };

const 체인 = (table: string) => {
  const filters: Record<string, unknown> = {};
  const self: Record<string, unknown> = {};
  const 기록 = () => { 물어본것.push({ table, filters: { ...filters } }); };
  self.select = () => self;
  self.eq = (col: string, value: unknown) => { filters[col] = value; return self; };
  self.order = () => self;
  self.limit = async () => {
    기록();
    return 실패읽기오류
      ? { data: null, error: 실패읽기오류 }
      : { data: [{ operation: "pdp_image", error_code: "quota_exceeded", created_at: "2026-09-22T00:00:00Z" }], error: null };
  };
  self.maybeSingle = async () => {
    기록();
    if (table === "user_subscriptions") return { data: 구독, error: null };
    return { data: { name: "Basic" }, error: null };
  };
  return self;
};

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => 체인(table) }),
}));

const 사용량읽기 = vi.fn(async (userId: string) => ({
  used: 10, reserved: 0, quota: 100, remaining: 90,
  periodStart: "2026-09-01", periodEnd: "2026-10-01",
  pricingPolicy: "image-v2" as const, _asked: userId,
}));

vi.mock("../../membership/server", () => ({ getUsageSummary: (id: string) => 사용량읽기(id) }));

const { readMyFacts } = await import("../my-account");

beforeEach(() => {
  물어본것.length = 0;
  실패읽기오류 = null;
  구독 = { plan_id: "basic", status: "active" };
  사용량읽기.mockClear();
});

/**
 * **이것이 계정 경계다.** 넘겨받은 그 회원으로만 묻는다.
 */
describe("누구 것을 읽나", () => {
  it("**넘겨받은 회원으로 사용량을 읽는다**", async () => {
    await readMyFacts("me-1", ["balance"]);

    expect(사용량읽기).toHaveBeenCalledWith("me-1");
  });

  it("**실패 기록도 그 회원 것만 묻는다**", async () => {
    await readMyFacts("me-1", ["failures"]);

    const 물음 = 물어본것.find((q) => q.table === "generation_events");
    expect(물음?.filters.user_id, "남의 것을 묻는다").toBe("me-1");
  });

  it("**플랜도 그 회원 것만 묻는다**", async () => {
    await readMyFacts("me-1", ["plan"]);

    const 물음 = 물어본것.find((q) => q.table === "user_subscriptions");
    expect(물음?.filters.user_id).toBe("me-1");
  });

  it("**회원이 없으면 아무것도 안 읽는다**", async () => {
    const facts = await readMyFacts("", ["balance", "failures"]);

    expect(facts).toEqual({});
    expect(물어본것, "주인 없이 물었다").toEqual([]);
    expect(사용량읽기).not.toHaveBeenCalled();
  });
});

/**
 * **안 물어본 것은 안 읽는다.** 값이 나가고, 답에 안 쓸 사실이 프롬프트에
 * 실린다.
 */
describe("고른 것만 읽는다", () => {
  it("**잔액만 물으면 실패 기록을 안 읽는다**", async () => {
    await readMyFacts("me-1", ["balance"]);

    expect(물어본것.some((q) => q.table === "generation_events"), "안 물어본 것을 읽었다").toBe(false);
  });

  it("**실패만 물으면 사용량을 안 읽는다**", async () => {
    await readMyFacts("me-1", ["failures"]);

    expect(사용량읽기).not.toHaveBeenCalled();
  });

  it("**아무것도 안 고르면 아무것도 안 읽는다**", async () => {
    await readMyFacts("me-1", []);

    expect(물어본것).toEqual([]);
    expect(사용량읽기).not.toHaveBeenCalled();
  });
});

/**
 * **「없다」와 「모른다」는 다르다.**
 *
 * 못 읽었는데 빈 목록을 돌려주면 화면이 「실패한 작업이 없습니다」라고
 * 말한다. 그것은 없는 사실이다.
 */
describe("못 읽었을 때", () => {
  it("**실패 기록을 못 읽으면 없다고 하지 않는다**", async () => {
    실패읽기오류 = { message: "표가 없습니다" };

    const facts = await readMyFacts("me-1", ["failures"]);

    expect(facts.failures, "못 읽었는데 빈 목록을 줬다").toBeUndefined();
  });

  it("**읽었는데 비어 있으면 빈 목록이다** — 그건 정말 없는 것이다", async () => {
    const facts = await readMyFacts("me-1", ["failures"]);

    expect(Array.isArray(facts.failures)).toBe(true);
  });

  it("**구독이 없으면 플랜이 없다고 한다**", async () => {
    구독 = null;

    const facts = await readMyFacts("me-1", ["plan"]);

    expect(facts.planName).toBeNull();
  });
});

/**
 * **오류 코드를 사람이 아는 말로 옮긴다.** 「quota_exceeded」를 그대로
 * 보여 주면 사용자는 모른다.
 */
describe("실패 까닭", () => {
  it("**아는 코드는 사람 말로 옮긴다**", async () => {
    const facts = await readMyFacts("me-1", ["failures"]);

    expect(facts.failures?.[0]?.reason).toContain("크레딧이 부족");
  });

  it("**작업 이름도 사람 말로 옮긴다**", async () => {
    const facts = await readMyFacts("me-1", ["failures"]);

    expect(facts.failures?.[0]?.what).toContain("상세페이지");
  });
});
