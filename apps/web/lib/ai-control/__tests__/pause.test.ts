import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **멈춤 스위치 읽기**(설계 2026-09-30 §3.3). `credit_reserve` 와 같게 **정확히 `'1'` 만** 멈춤이다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ value: null as unknown, error: null as null | { message: string }, throws: false }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    if (state.throws) throw new Error("SUPABASE_SECRET_KEY가 설정되지 않았습니다.");
    const self: Record<string, unknown> = {
      select: () => self,
      eq: () => self,
      maybeSingle: async () => ({ data: state.value === null ? null : { value: state.value }, error: state.error }),
    };
    return { from: () => self };
  },
}));

const { aiPausedFrom, isAiPaused } = await import("../pause");

beforeEach(() => { state.value = null; state.error = null; state.throws = false; });

describe("값", () => {
  it.each([["1", true], ["0", false], [" 1", false], ["true", false], [null, false], [1, false]])("%j → %s", (value, expected) => {
    expect(aiPausedFrom(value)).toBe(expected);
  });
});

describe("읽기", () => {
  it("'1' 이면 멈춤", async () => {
    state.value = "1";
    expect(await isAiPaused()).toBe(true);
  });

  it("줄이 없으면 멈추지 않음", async () => {
    expect(await isAiPaused()).toBe(false);
  });

  it("**못 읽으면 멈추지 않은 것으로 본다** — 이미 돈 낸 작업을 DB 흔들림으로 끊지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    state.error = { message: "timeout" };
    expect(await isAiPaused()).toBe(false);
    state.error = null;
    state.throws = true;
    expect(await isAiPaused()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
