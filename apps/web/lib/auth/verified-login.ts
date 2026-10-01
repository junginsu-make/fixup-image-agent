import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 서명을 확인한 로그인(설계 2026-09-29 §3.2).
 *
 * **토큰에서 읽은 세 값뿐이다.** 정지·탈퇴·관리자 여부는 여기 없다 — 그건
 * 요청마다 `profiles` 에서 읽는다. 토큰의 `role` 은 DB 역할(`authenticated`)이라
 * 관리자 판정에 쓰면 안 된다.
 */
export type VerifiedLogin = {
  userId: string;
  email: string | null;
  /** 이번 로그인의 번호 — 24시간 규칙이 시작 시각을 이 로그인에 묶는다. */
  sessionId: string | null;
};

type ClaimsAuth = Pick<SupabaseClient["auth"], "getClaims">;

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * `getUser()` 대신 `getClaims()` 로 로그인을 확인한다.
 *
 * 비대칭 키(ES256)면 Supabase 공개 키(10분 보관)로 **이 서버가 직접** 서명을
 * 확인한다 — 왕복이 없다. 대칭 키(HS256)거나 키 번호가 목록에 없으면
 * `getClaims` 가 **조용히** `getUser` 왕복으로 돌아간다. 그 횟수는
 * `auth-round-trips.ts` 가 센다.
 *
 * 토큰이 곧 만료되면 `getClaims` 가 먼저 갱신한다(`getUser` 와 같다).
 *
 * 변조된 토큰은 `error` 가 아니라 **예외**로 온다(auth-js 2.110.8
 * `GoTrueClient.getClaims`, `Invalid alg claim`·`crypto.subtle` 의
 * DOMException 등은 `isAuthError` 가 아니라 그대로 던진다). 여기서 잡아
 * 손님으로 돌린다 — 로그인 확인 한 번이 요청 전체를 터뜨리면 안 된다.
 */
export async function verifiedLogin(auth: ClaimsAuth): Promise<VerifiedLogin | null> {
  let data: { claims: Record<string, unknown> } | null;
  let error: unknown;
  try {
    ({ data, error } = await auth.getClaims());
  } catch {
    return null;
  }
  if (error || !data) return null;
  const userId = text(data.claims.sub);
  if (!userId) return null;
  return { userId, email: text(data.claims.email), sessionId: text(data.claims.session_id) };
}
