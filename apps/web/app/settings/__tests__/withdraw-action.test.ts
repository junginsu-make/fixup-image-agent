import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **탈퇴를 부르는 자리**(2026-09-23).
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 하는 일은 `lib/membership/withdraw-account.ts` 가 하고 그쪽 시험이 잰다.
 * 여기는 **문**이다 — 누구 것을 지우는가, 확인 글자를 보는가.
 *
 * ── 왜 이것이 중요한가 ─────────────────────────────────────
 *
 * 폼에서 회원 ID 를 받으면 **남의 ID 를 적어 보내는 것으로 남의 계정을
 * 지울 수 있다.** 옆의 `updateMyProfile` 이 같은 까닭으로 ID 를 안 받는다.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const 불린것: Array<{ userId: string; email: string }> = [];
let 로그인한사람 = { id: "u1", email: "me@example.com" };

vi.mock("../../../lib/membership/server", () => ({
  requireActiveMember: async () => ({
    user: { id: 로그인한사람.id },
    profile: { email: 로그인한사람.email },
  }),
}));

vi.mock("../../../lib/membership/profile-store", () => ({ updateProfileExtras: vi.fn() }));

let 탈퇴결과: { ok: boolean; message: string; path?: "delete" | "close" } = {
  ok: true, message: "탈퇴가 완료되었습니다.", path: "delete",
};

vi.mock("../../../lib/membership/withdraw-account", () => ({
  withdrawAccount: async (userId: string, email: string) => {
    불린것.push({ userId, email });
    return 탈퇴결과;
  },
}));

/** 이 브라우저의 로그인 흔적. 탈퇴가 끝나면 지워져야 한다. */
const 브라우저 = {
  쿠키: [] as string[],
  지운것: [] as string[],
  로그아웃: 0,
  로그아웃실패: false,
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => 브라우저.쿠키.map((name) => ({ name, value: "x" })),
    delete: (name: string) => { 브라우저.지운것.push(name); },
  }),
}));

vi.mock("../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signOut: async () => {
        브라우저.로그아웃 += 1;
        if (브라우저.로그아웃실패) throw new Error("network");
        return { error: null };
      },
    },
  }),
}));

const { withdrawMyAccount } = await import("../actions");

beforeEach(() => {
  불린것.length = 0;
  로그인한사람 = { id: "u1", email: "me@example.com" };
  탈퇴결과 = { ok: true, message: "탈퇴가 완료되었습니다.", path: "delete" };
  브라우저.쿠키 = ["sb-abc-auth-token", "sb-abc-auth-token.0", "fx_session_started", "mcs_project"];
  브라우저.지운것 = [];
  브라우저.로그아웃 = 0;
  브라우저.로그아웃실패 = false;
});

describe("확인 글자", () => {
  it("**이메일을 그대로 적어야 지운다**", async () => {
    const result = await withdrawMyAccount({ confirmEmail: "me@example.com" });

    expect(result.ok).toBe(true);
    expect(불린것).toHaveLength(1);
  });

  it.each([
    ["빈 것", ""],
    ["다른 이메일", "other@example.com"],
    ["오타", "me@exmaple.com"],
  ])("**%s 면 아무것도 안 한다**", async (_이름, confirmEmail) => {
    const result = await withdrawMyAccount({ confirmEmail });

    expect(result.ok).toBe(false);
    expect(불린것, "확인이 틀렸는데 지웠다").toEqual([]);
  });

  it("**틀리면 무엇을 적어야 하는지 말한다**", async () => {
    const result = await withdrawMyAccount({ confirmEmail: "" });

    expect(result.message).toContain("이메일");
  });
});

/**
 * **지우는 대상은 로그인한 본인뿐이다.**
 *
 * 폼에서 회원 ID 를 받지 않는다. 그래서 남의 것을 지울 길이 없다.
 */
describe("누구 것을 지우나", () => {
  it("**세션 주인 것을 지운다**", async () => {
    로그인한사람 = { id: "real-user", email: "real@example.com" };

    await withdrawMyAccount({ confirmEmail: "real@example.com" });

    expect(불린것[0]).toEqual({ userId: "real-user", email: "real@example.com" });
  });

  it("**받는 값은 확인 글자 하나뿐이다** — 회원 ID 를 안 받는다", async () => {
    // 남의 ID 를 섞어 보내도 실을 곳이 없다.
    await withdrawMyAccount({ confirmEmail: "me@example.com", userId: "someone-else" } as never);

    expect(불린것[0]!.userId, "요청에 실린 ID 를 따라갔다").toBe("u1");
  });
});

/**
 * **탈퇴하면 이 브라우저의 로그인도 끝난다**(2026-09-29).
 *
 * 전에는 계정만 처리하고 로그인 쿠키를 그대로 두었다. 기록이 있어 「닫힌」
 * 계정은 인증 계정이 남으므로, 로그인 화면이 「이미 로그인되어 있습니다」를
 * 띄웠다 — 탈퇴했는데 로그인된 채로 보였다(설명서 대조에서 발견).
 */
describe("탈퇴 뒤 로그인", () => {
  it.each([["지운 계정", "delete"], ["닫은 계정", "close"]] as const)(
    "**%s — 로그아웃하고 로그인 쿠키를 지운다**",
    async (_이름, path) => {
      탈퇴결과 = { ok: true, message: "탈퇴가 완료되었습니다.", path };
      const result = await withdrawMyAccount({ confirmEmail: "me@example.com" });

      expect(result.ok).toBe(true);
      expect(브라우저.로그아웃, "서버 쪽 로그인을 끝내지 않았다").toBe(1);
      expect(브라우저.지운것.sort()).toEqual(["fx_session_started", "sb-abc-auth-token", "sb-abc-auth-token.0"]);
    },
  );

  /** 로그인과 상관없는 쿠키(마지막 프로젝트)는 건드리지 않는다. */
  it("로그인과 상관없는 쿠키는 남긴다", async () => {
    await withdrawMyAccount({ confirmEmail: "me@example.com" });

    expect(브라우저.지운것).not.toContain("mcs_project");
  });

  /**
   * **로그아웃 요청이 실패해도 쿠키는 지운다.** 계정은 이미 처리됐다 — 그걸
   * 실패라 하면 회원은 다시 누르고, 두 번째는 「계정이 없습니다」를 본다.
   */
  it("로그아웃 요청이 실패해도 쿠키는 지우고 탈퇴는 성공이다", async () => {
    브라우저.로그아웃실패 = true;
    const result = await withdrawMyAccount({ confirmEmail: "me@example.com" });

    expect(result.ok).toBe(true);
    expect(브라우저.지운것).toContain("sb-abc-auth-token");
  });

  it("확인 글자가 틀리면 로그인을 건드리지 않는다", async () => {
    await withdrawMyAccount({ confirmEmail: "other@example.com" });

    expect(브라우저.로그아웃).toBe(0);
    expect(브라우저.지운것).toEqual([]);
  });

  /** 탈퇴가 안 됐는데 내보내면, 회원은 된 줄 안다. */
  it("탈퇴가 실패하면 로그인을 건드리지 않는다", async () => {
    탈퇴결과 = { ok: false, message: "지금 만들고 있는 작업이 있습니다." };
    const result = await withdrawMyAccount({ confirmEmail: "me@example.com" });

    expect(result.ok).toBe(false);
    expect(브라우저.로그아웃).toBe(0);
    expect(브라우저.지운것).toEqual([]);
  });
});
