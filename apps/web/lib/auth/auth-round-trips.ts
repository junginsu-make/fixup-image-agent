/**
 * 서버가 Supabase auth 로 왕복한 횟수를 센다(설계 2026-09-29 §3.2).
 *
 * S2 뒤로 서버의 로그인 확인은 `getClaims()` 다. 정상이면 **auth 서버로 가는
 * 요청이 없다** — 공개 키 목록(`jwks.json`)을 10분에 한 번 받을 뿐이다. 그런데
 * 토큰이 대칭 키(HS256)로 서명됐거나 키 번호가 목록에 없으면 `getClaims` 가
 * 조용히 `GET /auth/v1/user` 로 돌아간다. 그 왕복을 여기서 센다.
 *
 * 서버 쪽 클라이언트(`lib/supabase/server.ts`, `middleware.ts`)에만 단다. 브라우저
 * 클라이언트는 이 서버를 거치지 않는다.
 */
export type AuthRoundTripKind = "user" | "jwks";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const WINDOW_MS = 60_000;
/**
 * 공개 키 목록 보관 시간 — auth-js `JWKS_TTL`(10분). 이 셈은 프로세스마다
 * 따로라(웹 서버·미들웨어) 한 곳에서 10분에 한 번이 정상이다.
 */
const JWKS_TTL_MS = 10 * 60_000;

/** 이 요청이 auth 왕복인가. 비밀번호 바꾸기(PUT /user)·토큰 갱신은 원래 왕복이라 세지 않는다. */
export function classifyAuthRequest(url: string, method: string): AuthRoundTripKind | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (pathname.endsWith("/auth/v1/.well-known/jwks.json")) return "jwks";
  if (pathname.endsWith("/auth/v1/user") && method.toUpperCase() === "GET") return "user";
  return null;
}

type Tally = { user: number; jwks: number; since: number };

/**
 * 1분 단위로 모아 **이상할 때만** 한 줄 남긴다. 100명이 몰려도 1분에 한 줄이다.
 * 요청이 올 때 1분이 지났는지 본다(타이머를 따로 두지 않는다).
 */
export function createAuthRoundTripCounter(options: {
  now?: () => number;
  log?: (line: string) => void;
  baseFetch?: Fetch;
} = {}) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const baseFetch: Fetch = options.baseFetch ?? ((input, init) => globalThis.fetch(input, init));
  let tally: Tally = { user: 0, jwks: 0, since: now() };

  function record(kind: AuthRoundTripKind) {
    const counted: Tally = { ...tally, [kind]: tally[kind] + 1 };
    const at = now();
    if (at - counted.since < WINDOW_MS) {
      tally = counted;
      return;
    }
    const normalJwks = Math.floor((at - counted.since) / JWKS_TTL_MS) + 1;
    if (counted.user > 0 || counted.jwks > normalJwks) {
      log(`[auth-claims] 지난 ${Math.round((at - counted.since) / 1000)}초 auth 서버 왕복: getUser ${counted.user}회, 공개 키 목록 ${counted.jwks}회. getClaims 가 서명을 직접 확인하지 못하고 있다(설계 §3.2, JWT 키 확인)`);
    }
    tally = { user: 0, jwks: 0, since: at };
  }

  const fetch: Fetch = (input, init) => {
    const request = input instanceof Request ? input : null;
    const kind = classifyAuthRequest(request ? request.url : String(input), init?.method ?? request?.method ?? "GET");
    if (kind) record(kind);
    return baseFetch(input, init);
  };

  return { record, fetch };
}

/** 프로세스(웹 서버·미들웨어 각각)에 하나. */
export const authRoundTrips = createAuthRoundTripCounter();
