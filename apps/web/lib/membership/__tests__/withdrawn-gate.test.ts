import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTerminalWait, isUsableAccount } from "../usable";

/**
 * **탈퇴한 계정은 못 들어온다**(2026-09-23).
 *
 * ── 왜 따로 재나 ───────────────────────────────────────────
 *
 * 돈 기록이 있어 **지우지 못하고 닫기만 한 계정**은 인증 자체가 살아 있다.
 * `auth.users` 에 그대로 있고 비밀번호도 그대로다. **문을 안 막으면 탈퇴한
 * 사람이 그냥 로그인해서 쓴다.**
 *
 * 문이 셋이다 — 스튜디오(`isUsableAccount`), API(`authenticateApiMember`),
 * 그리고 대기 화면(`isTerminalWait`). 하나만 빠져도 샌다.
 */

describe("스튜디오 문", () => {
  it("**탈퇴한 계정은 못 쓴다**", () => {
    expect(isUsableAccount({ email_confirmed_at: "2026-09-01", status: "withdrawn" })).toBe(false);
  });

  it("**멀쩡한 계정은 쓴다** — 문을 통째로 잠그지 않았다", () => {
    expect(isUsableAccount({ email_confirmed_at: "2026-09-01", status: "active" })).toBe(true);
  });
});

/**
 * **기다려도 안 풀린다.**
 *
 * 대기 화면이 상태를 계속 되물으면 서버만 두드릴 뿐 화면은 영영 그대로다.
 * 그리고 사용자는 곧 풀릴 것처럼 오해한다.
 */
describe("대기 화면", () => {
  it("**탈퇴한 계정은 기다릴 것이 없다**", () => {
    expect(isTerminalWait({ status: "withdrawn" })).toBe(true);
  });

  it("**정지도 그대로다** — 옛 규칙을 안 깼다", () => {
    expect(isTerminalWait({ status: "suspended" })).toBe(true);
  });

  it("**승인 대기는 기다릴 만하다**", () => {
    expect(isTerminalWait({ status: "pending" })).toBe(false);
  });
});

/**
 * **API 문.** 화면을 막아도 요청은 따로 들어온다.
 */
describe("API 문", () => {
  const profile = { status: "active", email_confirmed_at: "2026-09-01" };

  beforeEach(() => {
    vi.resetModules();
  });

  const 문을연다 = async (status: string) => {
    vi.doMock("server-only", () => ({}));
    vi.doMock("../../supabase/server", () => ({
      createSupabaseServerClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: { ...profile, status } }) }) }),
        }),
      }),
    }));
    const { authenticateApiMember } = await import("../api");
    return authenticateApiMember();
  };

  it("**탈퇴한 계정은 403 이다**", async () => {
    const result = await 문을연다("withdrawn");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.response.status).toBe(403);
  });

  it("**까닭을 탈퇴라고 말한다** — 정지와 구분된다", async () => {
    const result = await 문을연다("withdrawn");
    const body = result.ok === false ? await result.response.json() : null;

    expect(JSON.stringify(body)).toContain("탈퇴");
  });

  it("**멀쩡한 계정은 들어온다**", async () => {
    expect((await 문을연다("active")).ok).toBe(true);
  });
});
