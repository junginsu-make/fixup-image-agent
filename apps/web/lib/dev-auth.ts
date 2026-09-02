import type { MemberProfile, MembershipContext, UsageSummary } from "./membership/types";

/**
 * 로컬 확인용 인증 우회.
 *
 * 운영 Supabase 로 로컬에서 로그인하려면 Turnstile 캡차를 통과해야 하는데,
 * 사이트 키가 운영 도메인에만 등록돼 있어 localhost 에서는 위젯이 뜨지 않는다.
 * 화면을 확인하려는 것뿐인데 매번 막히므로 로컬에서만 여는 문을 둔다.
 *
 * 두 조건을 모두 만족해야만 열린다.
 *   1) NODE_ENV 가 production 이 아니다
 *   2) LOCAL_AUTH_BYPASS=1 이 설정돼 있다
 *
 * next build / next start 는 NODE_ENV=production 이므로 배포본에서는
 * 환경변수를 어떻게 넣든 절대 열리지 않는다.
 */
export const isLocalAuthBypass =
  process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_BYPASS === "1";

/** 로컬 우회 모드에서 문을 두드리면 열리는 곳. */
export const LOCAL_BYPASS_ENTRY = "/create";

/** 화면. 처리기(/auth/confirm, /auth/signout)는 여기 없다 — 가로채면 인증이 끊긴다. */
const AUTH_SCREENS = ["/login", "/signup", "/forgot-password", "/reset-password"];

/**
 * 로컬 우회 모드에서 인증 화면을 어디로 보낼지.
 *
 * 로컬은 Supabase 공개 환경변수를 비워 두므로 이 화면들은 어차피 못 쓴다.
 * 그대로 두면 사용자가 막힌 문을 두드리게 된다. 바로 들여보낸다.
 */
export function localBypassRedirect(pathname: string): string | null {
  return AUTH_SCREENS.includes(pathname) ? LOCAL_BYPASS_ENTRY : null;
}

const DEV_USER_ID = process.env.LOCAL_AUTH_USER_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const DEV_EMAIL = process.env.LOCAL_AUTH_EMAIL?.trim() || "local-dev@example.com";

export const devMemberProfile: MemberProfile = {
  id: DEV_USER_ID,
  email: DEV_EMAIL,
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  role: "admin",
  status: "active",
  monthly_quota: 9999,
  approved_at: "2026-01-01T00:00:00.000Z",
  approval_notified_at: "2026-01-01T00:00:00.000Z",
  created_at: "2026-01-01T00:00:00.000Z",
};

export const devMembership: MembershipContext = {
  user: { id: DEV_USER_ID, email: DEV_EMAIL },
  profile: devMemberProfile,
};

export const devUsageSummary: UsageSummary = {
  used: 0,
  reserved: 0,
  quota: 9999,
  remaining: 9999,
  // 실제 RPC 는 날짜만 돌려준다. /settings 가 여기에 시각을 덧붙여 Date 를 만들므로
  // 전체 타임스탬프를 넣으면 Invalid time value 가 된다.
  periodStart: "2026-07-01",
  periodEnd: "2026-08-01",
};
