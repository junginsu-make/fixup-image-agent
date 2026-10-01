import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **API·화면의 문을 getClaims 로 바꿔도 막을 사람은 그대로 막는다**(설계 2026-09-29 §3.2).
 *
 * 토큰 서명은 「누구인가」만 말한다. 정지·탈퇴·승인 대기·메일 미인증·지워진
 * 계정은 토큰이 멀쩡해도 막혀야 한다 — 그 판정은 지금처럼 요청마다
 * `profiles` 에서 읽는다. `getUser` 를 부르면 이 시험이 터진다(왕복 금지).
 */
const state = vi.hoisted(() => ({
  claims: { sub: "u1", email: "a@b.c", session_id: "s1" } as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  profileReads: 0,
  readIds: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      getUser: async () => { throw new Error("getUser 를 불렀다 — 로그인 확인은 getClaims 여야 한다(설계 §3.2)"); },
    },
    from: () => ({
      select: () => ({ eq: (_column: string, id: unknown) => {
        state.readIds.push(id);
        return { single: async () => { state.profileReads += 1; return { data: state.profile }; } };
      } }),
    }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {}, devMembership: null }));

const 활성 = { id: "u1", email: "a@b.c", email_confirmed_at: "2026-09-01", role: "member", status: "active" };

beforeEach(() => {
  state.claims = { sub: "u1", email: "a@b.c", session_id: "s1" };
  state.profile = { ...활성 };
  state.profileReads = 0;
  state.readIds = [];
});

describe("authenticateApiMember", () => {
  it("소셜 인증을 마쳐도 가입 정보 확인 전이면 API에서 막는다", async () => {
    state.profile = { ...활성, onboarding_required: true, onboarding_completed_at: null };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();
    expect(result.ok).toBe(false);
    expect(!result.ok && await result.response.json()).toMatchObject({ code: "onboarding_required" });
    state.profile.onboarding_completed_at = "2026-10-01";
    expect((await authenticateApiMember()).ok).toBe(true);
  });
  it("서명이 맞고 활성 회원이면 들여보낸다 — profiles 는 한 번 읽는다", async () => {
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok && result.member.userId).toBe("u1");
    expect(state.profileReads).toBe(1);
  });

  it("profiles 는 토큰의 회원 번호(sub)로 읽는다", async () => {
    state.claims = { sub: "u9" };
    state.profile = { ...활성, id: "u9" };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(state.readIds).toEqual(["u9"]);
    expect(result.ok && result.member.userId).toBe("u9");
  });

  it("로그인이 없으면 401", async () => {
    state.claims = null;
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(401);
  });

  it.each([
    ["suspended", "suspended"],
    ["withdrawn", "withdrawn"],
    ["pending", "pending"],
  ])("profiles.status 가 %s 이면 403 %s", async (status, code) => {
    state.profile = { ...활성, status };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok).toBe(false);
    const body = result.ok === false ? await result.response.json() : null;
    expect(body).toMatchObject({ code });
  });

  it("메일 미인증이면 403", async () => {
    state.profile = { ...활성, email_confirmed_at: null };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(403);
  });

  it("profiles 행이 없으면(지운 계정의 남은 토큰) 403", async () => {
    state.profile = null;
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(403);
  });
});

describe("getMembership", () => {
  it("회원 번호·메일은 토큰에서, 나머지는 profiles 에서", async () => {
    const { getMembership } = await import("../server");
    const membership = await getMembership();

    expect(membership?.user).toEqual({ id: "u1", email: "a@b.c" });
    expect(membership?.profile.status).toBe("active");
  });

  it("로그인이 없으면 null — profiles 를 읽지 않는다", async () => {
    state.claims = null;
    const { getMembership } = await import("../server");

    await expect(getMembership()).resolves.toBeNull();
    expect(state.profileReads).toBe(0);
  });

  it("탈퇴 회원도 membership 은 돌려주고, 문(isUsableAccount)이 막는다 — 지금과 같다", async () => {
    state.profile = { ...활성, status: "withdrawn" };
    const { getMembership } = await import("../server");
    const { isUsableAccount } = await import("../usable");
    const membership = await getMembership();

    expect(membership && isUsableAccount(membership.profile)).toBe(false);
  });
});
