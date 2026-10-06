import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **거부(잊기) 실패를 숨기지 않는다.** `forgetCookie` 가 false 를 돌려야 동의 API 가 503 을 내고,
 * 쿠키를 그대로 둬서 다시 누르게 한다. 여기가 true 로 새면 「지웠다」고 거짓말하게 된다.
 */
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.spyOn(console, "warn").mockImplementation(() => undefined);
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));

const { forgetCookie } = await import("../record");
const ID = "123e4567-e89b-42d3-a456-426614174000";

describe("forgetCookie", () => {
  beforeEach(() => { rpc.mockReset(); });

  it("지우기 함수를 그 번호로 부른다", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await forgetCookie(ID);
    expect(rpc).toHaveBeenCalledWith("analytics_forget", { p_cookie: ID });
  });

  it("성공하면 true", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await forgetCookie(ID)).toBe(true);
  });

  it("DB 가 오류를 돌려주면 false", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await forgetCookie(ID)).toBe(false);
  });

  it("호출이 던지면 false", async () => {
    rpc.mockImplementation(async () => { throw new Error("network"); });
    expect(await forgetCookie(ID)).toBe(false);
  });
});
