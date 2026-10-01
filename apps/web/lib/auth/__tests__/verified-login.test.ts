import { describe, expect, it } from "vitest";
import { verifiedLogin } from "../verified-login";

/**
 * **로그인 확인은 토큰 서명으로 한다**(설계 2026-09-29 §3.2).
 *
 * `getUser()` 는 부를 때마다 Supabase 까지 0.2초 왕복이었다. `getClaims()` 는
 * 서명을 이 서버에서 확인한다. 이 도우미는 그 결과에서 **우리가 쓰는 세 값만**
 * 꺼낸다 — 관리자 여부(토큰의 `role` 은 DB 역할 `authenticated` 다)는 일부러
 * 담지 않는다. 관리자는 늘 `profiles.role` 로 본다.
 */
type ClaimsReply = { data: { claims: Record<string, unknown> } | null; error: unknown };
const auth = (reply: ClaimsReply) => ({ getClaims: async () => reply }) as never;
const 정상 = { sub: "user-1", email: "a@b.c", session_id: "session-1", role: "authenticated" };

describe("verifiedLogin", () => {
  it("서명이 맞으면 회원 번호·메일·세션 번호를 돌려준다", async () => {
    await expect(verifiedLogin(auth({ data: { claims: 정상 }, error: null }))).resolves.toEqual({
      userId: "user-1", email: "a@b.c", sessionId: "session-1",
    });
  });

  it("토큰의 role 은 싣지 않는다 — 관리자 판정은 profiles.role 이다", async () => {
    const login = await verifiedLogin(auth({ data: { claims: { ...정상, role: "service_role" } }, error: null }));
    expect(login).not.toHaveProperty("role");
  });

  it("로그인이 없으면(data null, error null) 손님이다", async () => {
    await expect(verifiedLogin(auth({ data: null, error: null }))).resolves.toBeNull();
  });

  it("서명·만료 오류가 있으면 손님이다", async () => {
    await expect(verifiedLogin(auth({ data: { claims: 정상 }, error: new Error("Invalid JWT signature") }))).resolves.toBeNull();
  });

  it("변조된 토큰으로 getClaims 가 예외를 던지면 손님이다 — 터지지 않는다", async () => {
    const auth = { getClaims: async () => { throw new Error("Invalid alg claim"); } } as never;
    await expect(verifiedLogin(auth)).resolves.toBeNull();
  });

  it.each([undefined, "", 42])("sub 가 %s 이면 손님이다 — 누구인지 모르는 로그인은 없다", async (sub) => {
    await expect(verifiedLogin(auth({ data: { claims: { ...정상, sub } }, error: null }))).resolves.toBeNull();
  });

  it.each([{}, { session_id: "", email: "" }, { session_id: 7, email: 7 }])(
    "세션 번호·메일이 없거나 글자가 아니면(%o) null 로 둔다 — 24시간 규칙은 시각만으로 잰다",
    async (extra) => {
      await expect(verifiedLogin(auth({ data: { claims: { sub: "user-1", ...extra } }, error: null }))).resolves.toEqual({
        userId: "user-1", email: null, sessionId: null,
      });
    },
  );
});
