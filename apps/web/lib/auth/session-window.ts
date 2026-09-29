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

/**
 * **시작 시각 쿠키의 수명 — 로그인 쿠키만큼(400일)**(2026-09-29 고침).
 *
 * 전에는 24시간이었다. 그러면 끊어야 할 바로 그 순간에 브라우저가 쿠키를
 * 먼저 버려서, 다음 요청이 「처음 들어옴」으로 읽혀 새 24시간이 시작됐다.
 * 제한이 한 번도 걸리지 않았다.
 *
 * 만료는 **쿠키 수명이 아니라 적힌 시각**으로 잰다. 쿠키는 로그인 쿠키가 사는
 * 동안 함께 살아 있어야 그 시각을 들고 온다. 400일은 `@supabase/ssr` 의
 * 로그인 쿠키 기본 수명이다.
 */
export const SESSION_START_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

export type SessionWindow =
  | { state: "start"; startedAt: number }
  | { state: "valid" }
  | { state: "expired" };

/**
 * 쿠키에 적는 값 — `시작시각.세션번호`(2026-09-29).
 *
 * **시작 시각을 그 로그인에 묶는다.** 쿠키가 로그인 쿠키만큼 살게 되면서
 * 로그아웃 뒤에도 남는다. 묶지 않으면 며칠 뒤 다시 로그인하자마자 옛 시각으로
 * 「24시간 지남」이 되고, 계정을 바꿔 들어온 사람이 앞사람의 시각을 물려받는다.
 * Supabase 는 로그인할 때마다 새 `session_id` 를 준다.
 */
export function sessionStartValue(startedAt: number, sessionId: string | null): string {
  return sessionId ? `${startedAt}.${sessionId}` : String(startedAt);
}

/**
 * 로그인 토큰(JWT)의 가운데 조각에서 `session_id` 를 읽는다.
 *
 * 서명은 여기서 보지 않는다 — 이 값은 **어느 로그인의 시각인지 가르는 데만**
 * 쓴다. 로그인이 진짜인지는 미들웨어가 먼저 `getUser()` 로 확인했다.
 */
export function sessionIdFromAccessToken(token: string | null | undefined): string | null {
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as { session_id?: unknown };
    return typeof claims.session_id === "string" && claims.session_id ? claims.session_id : null;
  } catch {
    return null;
  }
}

/**
 * 이 로그인을 더 유지할지 정한다.
 *
 * `start` 는 「시작 시각을 지금으로 적어라」, `expired` 는 「내보내라」,
 * `valid` 는 「그대로 둬라」다. 값이 없거나 깨졌으면 **지금부터 다시 센다** —
 * 못 읽는다는 이유로 계속 열어 두지 않는다.
 *
 * `sessionId` 를 주면 **쿠키에 적힌 세션 번호와 같을 때만** 그 시각으로 잰다.
 * 다르거나(다시 로그인·계정 바꿈) 옛 모양(시각만)이면 새로 센다. 세션 번호를
 * 못 읽었으면(`null`) 시각만으로 잰다.
 */
export function sessionWindow(raw: string | undefined, now: Date, sessionId: string | null = null): SessionWindow {
  const [시각글자 = "", 적힌세션 = null] = (raw ?? "").split(".", 2);
  const startedAt = Number(시각글자);
  const usable = raw !== undefined && 시각글자 !== "" && Number.isSafeInteger(startedAt) && startedAt > 0;
  // 미래가 적혀 있으면 시계가 틀렸거나 손댄 것이다. 지금부터 다시 센다.
  if (!usable || startedAt > now.getTime()) return { state: "start", startedAt: now.getTime() };
  // 다른 로그인의 시각이다 — 다시 로그인했거나 계정을 바꿨다. 새로 센다.
  if (sessionId && 적힌세션 !== sessionId) return { state: "start", startedAt: now.getTime() };
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
