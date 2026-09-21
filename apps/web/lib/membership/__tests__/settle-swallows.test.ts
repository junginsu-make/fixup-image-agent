import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **장부를 못 닫았다고 사용자가 만든 것을 잃으면 안 된다**(X-02).
 *
 * 설계 §14.6: 「finalize-safety 대상 누락 | PDP·리디자인 **모든 유료/계량
 * 라우트 실패 주입** | T-SETTLE/T-COST」.
 *
 * 유료 라우트 아홉이 전부 `settleAiUsage` 하나에 기대고 있다. 그 함수가
 * **던지지 않는다**는 성질이 무너지면, 이미 만들어 낸 결과가 성공 경로의
 * `try` 에서 catch 로 빨려 들어가 「생성 실패」로 둔갑한다. 사용자는 다시 눌러
 * 돈을 또 쓴다.
 *
 * ── 그런데 그 성질을 아무도 돌려 보지 않았다 ────────────────
 *
 * `finalize-safety.test.ts` 는 **정규식 소스 대조**이고, 라우트 시험들은
 * 하나같이 `settleAiUsage` 를 **흉내로 바꿔치기**한다
 * (`route-reliability.test.ts`·`settlement.test.ts`). 그래서 진짜 구현은 이
 * 저장소에서 **한 번도 실행되지 않았다**(2026-09-21 확인).
 *
 * ── 어떻게 진짜를 돌리나 ────────────────────────────────────
 *
 * `settleAiUsage` 는 같은 모듈의 `finalizeAiUsage` 를 부르므로 모듈 흉내로는
 * 그 호출을 못 가로챈다. **아래층을 흔든다** — `finalizeAiUsage` 가 쓰는
 * `createSupabaseAdminClient` 는 다른 모듈이다. 그것이 터지게 해 두면
 * 진짜 `settleAiUsage` 가 진짜 `finalizeAiUsage` 를 부르고, 그 실패를
 * 삼키는지 아닌지가 그대로 드러난다.
 */

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  /** `finalize_generation` 이 무엇을 돌려줄까. */
  rpc: null as null | (() => Promise<{ data: unknown; error: unknown }>),
  /** 부른 인자를 받아 적는다. */
  calls: [] as Array<{ name: string; args: unknown }>,
}));

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (name: string, args: unknown) => {
      state.calls.push({ name, args });
      if (!state.rpc) throw new Error("rpc 흉내가 준비되지 않았다");
      return state.rpc();
    },
    from: () => ({
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

const { finalizeAiUsage, settleAiUsage } = await import("../api");

const 예약 = { userId: "u1", requestId: "r1" };

beforeEach(() => {
  state.calls.length = 0;
  state.rpc = async () => ({
    data: [{ used_units: 4, quota: 100, current_period_start: "2026-09-01", current_period_end: "2026-10-01" }],
    error: null,
  });
});

describe("장부가 흔들려도 결과를 안 버린다", () => {
  it("**RPC 가 오류를 주면 던지지 않고 아무것도 안 준다**", async () => {
    state.rpc = async () => ({ data: null, error: { message: "RPC 가 흔들렸다" } });

    await expect(settleAiUsage(예약, true, 4)).resolves.toBeUndefined();
  });

  it("**RPC 가 통째로 터져도 던지지 않는다**", async () => {
    state.rpc = async () => {
      throw new Error("연결이 끊겼다");
    };

    await expect(settleAiUsage(예약, true, 4)).resolves.toBeUndefined();
  });

  /**
   * **행이 안 오는 것도 실패다.** 「오류는 없는데 결과도 없다」는 장부가 안
   * 닫혔다는 뜻이다.
   */
  it("**빈 결과여도 던지지 않는다**", async () => {
    state.rpc = async () => ({ data: [], error: null });

    await expect(settleAiUsage(예약, true, 4)).resolves.toBeUndefined();
  });

  it("**닫혔으면 장부가 준 것을 준다**", async () => {
    const usage = await settleAiUsage(예약, true, 4);

    expect(usage).toBeTruthy();
    expect(state.calls[0]?.name).toBe("finalize_generation");
  });

  /**
   * **받은 것을 그대로 넘긴다.** 장수나 오류 코드를 도중에 바꾸면 장부와
   * 화면이 다른 말을 한다.
   */
  it("**장수와 오류 코드를 그대로 넘긴다**", async () => {
    await settleAiUsage(예약, false, 0, "no_image_generated");

    expect(state.calls[0]?.args).toMatchObject({
      p_user_id: "u1",
      p_request_id: "r1",
      p_success: false,
      p_consumed_units: 0,
      p_error_code: "no_image_generated",
    });
  });
});

/**
 * **감싸지 않은 쪽은 여전히 던진다.** 그래야 감싸는 일에 뜻이 있다.
 */
describe("감싸지 않은 쪽은 던진다", () => {
  it("**`finalizeAiUsage` 는 그대로 던진다**", async () => {
    state.rpc = async () => ({ data: null, error: { message: "RPC 가 흔들렸다" } });

    await expect(finalizeAiUsage(예약, true, 4)).rejects.toBeTruthy();
  });

  /**
   * **행이 안 오는 것도 실패다.**
   *
   * 「오류는 없는데 결과도 없다」는 장부가 안 닫혔다는 뜻이다. 그것을 성공으로
   * 치면 예약된 크레딧이 묶인 채로 남는데 아무도 모른다. 감싼 쪽에서는 둘 다
   * `undefined` 라 구별이 안 되므로 **여기서 재야 한다**(2026-09-21 변이).
   */
  it("**빈 결과도 던진다**", async () => {
    state.rpc = async () => ({ data: [], error: null });

    await expect(finalizeAiUsage(예약, true, 4)).rejects.toBeTruthy();
  });
});

/**
 * **못 닫았으면 누구의 어느 요청인지 남긴다.**
 *
 * 예약된 채 묶인 크레딧은 손으로 풀어야 하는데, 그러려면 사용자 id 와 요청
 * id 가 있어야 한다. 코드 주석이 그것을 적어 두었지만 **재는 것이 없었다** —
 * 그래서 판정 줄을 `if (error)` 로 좁혀 빈 결과가 로그 없이 지나가게 만들어도
 * 아무 시험도 안 빨개졌다(2026-09-21 변이).
 */
describe("못 닫은 요청을 손으로 풀 수 있게 남긴다", () => {
  const 찍힌것: string[] = [];
  let 원래: typeof console.error;

  beforeEach(() => {
    찍힌것.length = 0;
    원래 = console.error;
    console.error = (...args: unknown[]) => {
      찍힌것.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.error = 원래;
  });

  it.each([
    ["RPC 가 오류를 줄 때", async () => ({ data: null, error: { message: "흔들렸다" } })],
    ["행이 안 올 때", async () => ({ data: [], error: null })],
  ])("**%s 사용자와 요청 id 를 남긴다**", async (_label, rpc) => {
    state.rpc = rpc as never;

    await settleAiUsage(예약, true, 4);

    const 로그 = 찍힌것.join(" | ");
    expect(로그).toContain("[usage]");
    expect(로그).toContain("u1");
    expect(로그).toContain("r1");
  });

  it("**잘 닫히면 아무 말도 안 한다**", async () => {
    await settleAiUsage(예약, true, 4);

    expect(찍힌것.filter((line) => line.includes("[usage]"))).toHaveLength(0);
  });
});
