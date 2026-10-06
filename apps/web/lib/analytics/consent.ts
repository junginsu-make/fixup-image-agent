/**
 * **방문 통계 쿠키 동의**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * `fx_consent` — 동의(1)·거부(0)를 기억한다. 동의 띠가 읽어야 하므로 HttpOnly 가 아니다.
 * `fx_vid`     — **동의한 경우에만** 서버가 심는 무작위 번호. 여러 날을 잇는다. 화면 스크립트는 못 읽는다(HttpOnly).
 *
 * 이름과 기간은 처리방침 제11조 표와 `launch-ready.test.ts` 로 묶인다.
 */
export const CONSENT_COOKIE = "fx_consent";
export const VISITOR_COOKIE = "fx_vid";
export const ANALYTICS_COOKIE_DAYS = 365;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      return null;
    }
  }
  return null;
}

export type Consent = "yes" | "no" | "unset";

export function consentFrom(value: string | null): Consent {
  if (value === "1") return "yes";
  if (value === "0") return "no";
  return "unset";
}

/** 우리가 만든 모양(UUID v4)이 아니면 버린다 — 요청자가 쿠키에 아무 값이나 넣을 수 있다. */
export function validVisitorId(value: string | null): string | null {
  return value && UUID_V4.test(value) ? value.toLowerCase() : null;
}

export function setCookie(name: string, value: string, { secure, httpOnly, days }: { secure: boolean; httpOnly: boolean; days: number }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${days * 86_400}`,
    "SameSite=Lax",
    ...(httpOnly ? ["HttpOnly"] : []),
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export const clearCookie = (name: string, secure: boolean) => setCookie(name, "", { secure, httpOnly: true, days: 0 });
