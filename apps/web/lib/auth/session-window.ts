/**
 * 로그인 유지 시간 — **하루** (2026-09-23 사용자).
 *
 * 왜 필요한가. 지금까지는 한 번 로그인하면 브라우저에 그대로 남았다. 공용
 * 컴퓨터에 남은 로그인으로 다른 사람이 그대로 들어갈 수 있고, 실제로
 * 「ai.dev 로 로그인했는데 다른 계정으로 되어 있었다」는 신고가 있었다.
 *
 * **시작 시각은 늘리지 않는다.** 쓰는 동안 계속 미루면 하루 제한이 사실상
 * 없어진다. 로그인한 순간부터 24시간이다.
 *
 * 이 값은 우리 쿠키로 재는 것이라 브라우저에서 지우면 다시 24시간이 된다.
 * 진짜 강제는 Supabase 쪽 세션 제한(Time-box user sessions)이 함께 있어야
 * 완전하다 — 그건 대시보드 설정이다.
 */
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000;

/** 로그인한 시각을 적어 두는 쿠키. 값은 밀리초 숫자 하나뿐이다. */
export const SESSION_START_COOKIE = "fx_session_started";

export type SessionWindow =
  | { state: "start"; startedAt: number }
  | { state: "valid" }
  | { state: "expired" };

/**
 * 이 로그인을 더 유지할지 정한다.
 *
 * `start` 는 「시작 시각을 지금으로 적어라」, `expired` 는 「내보내라」,
 * `valid` 는 「그대로 둬라」다. 값이 없거나 깨졌으면 **지금부터 다시 센다** —
 * 못 읽는다는 이유로 계속 열어 두지 않는다.
 */
export function sessionWindow(raw: string | undefined, now: Date): SessionWindow {
  const startedAt = Number(raw);
  const usable = raw !== undefined && raw !== "" && Number.isSafeInteger(startedAt) && startedAt > 0;
  // 미래가 적혀 있으면 시계가 틀렸거나 손댄 것이다. 지금부터 다시 센다.
  if (!usable || startedAt > now.getTime()) return { state: "start", startedAt: now.getTime() };
  return now.getTime() - startedAt >= SESSION_MAX_MS ? { state: "expired" } : { state: "valid" };
}

/**
 * 내보낼 때 지울 쿠키.
 *
 * Supabase 는 토큰이 길면 `...auth-token.0`, `.1` 로 쪼갠다. 하나만 지우면
 * 반쪽이 남아 로그인도 로그아웃도 아닌 상태가 된다.
 */
export function sessionAuthCookieNames(names: readonly string[]): string[] {
  return names.filter((name) => /^sb-.*-auth-token/.test(name) || name === SESSION_START_COOKIE);
}
