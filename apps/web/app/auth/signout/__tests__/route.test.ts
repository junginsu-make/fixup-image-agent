import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **로그아웃하면 로그인 시각 쿠키도 지운다**(2026-09-29 독립 리뷰).
 *
 * 시작 시각 쿠키(`fx_session_started`)는 이제 로그인 쿠키만큼 오래 산다. 로그아웃
 * 경로가 그것을 남겨 두면, 세션 번호를 못 읽는 드문 경우에 옛 시각으로 재어
 * 다시 로그인하자마자 한 번 튕길 수 있다. 로그아웃은 둘 다 지운다.
 */

const 흔적 = { 지운것: [] as string[], 로그아웃: 0 };

vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: (name: string) => { 흔적.지운것.push(name); } }),
}));

vi.mock("../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { signOut: async () => { 흔적.로그아웃 += 1; return { error: null }; } },
  }),
}));

const { POST } = await import("../route");

beforeEach(() => {
  흔적.지운것 = [];
  흔적.로그아웃 = 0;
});

describe("로그아웃", () => {
  it("로그인을 끝내고 로그인 시각 쿠키도 지운다", async () => {
    const response = await POST();

    expect(흔적.로그아웃).toBe(1);
    expect(흔적.지운것).toContain("fx_session_started");
    expect(await response.json()).toEqual({ ok: true });
  });
});
