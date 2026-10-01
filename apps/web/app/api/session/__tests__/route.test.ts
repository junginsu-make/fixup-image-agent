import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **첫 화면 머리의 로그인 표시도 getClaims 로**(설계 2026-09-29 §3.2).
 *
 * 정적 첫 화면(`public/landing.html`)이 손님마다 부른다. 승인 판정은 지금처럼
 * profiles 로 한다 — 정지된 회원은 「로그인됨·못 씀」이다.
 */
const state = vi.hoisted(() => ({
  claims: { sub: "u1" } as Record<string, unknown> | null,
  profile: { status: "active", email_confirmed_at: "2026-09-01" } as Record<string, unknown> | null,
}));
vi.mock("../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      getUser: async () => { throw new Error("getUser 를 불렀다 — getClaims 여야 한다(설계 §3.2)"); },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  state.claims = { sub: "u1" };
  state.profile = { status: "active", email_confirmed_at: "2026-09-01" };
});

describe("GET /api/session", () => {
  it("활성 회원은 로그인됨·쓸 수 있음", async () => {
    await expect((await GET()).json()).resolves.toEqual({ authenticated: true, active: true });
  });

  it("정지 회원은 로그인됨·못 씀 — profiles 판정은 그대로다", async () => {
    state.profile = { status: "suspended", email_confirmed_at: "2026-09-01" };
    await expect((await GET()).json()).resolves.toEqual({ authenticated: true, active: false });
  });

  it("로그인이 없으면 손님", async () => {
    state.claims = null;
    await expect((await GET()).json()).resolves.toEqual({ authenticated: false, active: false });
  });
});
