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

vi.mock("../../../lib/membership/withdraw-account", () => ({
  withdrawAccount: async (userId: string, email: string) => {
    불린것.push({ userId, email });
    return { ok: true, message: "탈퇴가 완료되었습니다.", path: "delete" as const };
  },
}));

const { withdrawMyAccount } = await import("../actions");

beforeEach(() => {
  불린것.length = 0;
  로그인한사람 = { id: "u1", email: "me@example.com" };
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
