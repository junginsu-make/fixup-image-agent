/**
 * **방문 한 줄에 무엇을 남길지 정하는 규칙**(계획 2026-10-06 site-analytics).
 *
 * 화면(보내기 전에 줄이기)과 서버(받은 것을 믿지 않고 다시 줄이기)가 같은 규칙을 쓴다.
 * 그래서 `server-only` 를 붙이지 않는다.
 *
 * 남기지 않는 것: 주소 뒤 조회 값(`?…`·`#…` — 메일 인증 토큰이 여기 실린다), 개별 작업 번호,
 * 들어오기 전 사이트의 경로·검색어, 원래 IP·브라우저 정보 전체.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC = /^\d+$/;
// 숫자가 섞인 16자 이상 — 공유 토큰·짧은 id 모양.
const LONG_TOKEN = /^(?=.*\d)[A-Za-z0-9_-]{16,}$/;
const MAX_PATH = 200;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function normalizePath(pathname: string): string | null {
  if (!pathname.startsWith("/")) return null;
  const clean = pathname.split(/[?#]/)[0] ?? "/";
  const segments = clean
    .split("/")
    .filter(Boolean)
    .map(decodeSegment)
    .map((segment) => (UUID.test(segment) || NUMERIC.test(segment) || LONG_TOKEN.test(segment) ? ":id" : segment));
  return `/${segments.join("/")}`.slice(0, MAX_PATH);
}

/** 관리자 화면과 API 는 세지 않는다 — 운영자가 숫자를 부풀린다. */
export function isTrackedPath(path: string): boolean {
  const under = (root: string) => path === root || path.startsWith(`${root}/`);
  return !under("/admin") && !under("/api");
}

const bareHost = (host: string) => host.toLowerCase().split(":")[0]!.replace(/^www\./, "");

export function referrerHost(referrer: string | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = bareHost(url.hostname);
  if (!host || host === bareHost(ownHost)) return null;
  return host.slice(0, 120);
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"] as const;

/** 화면이 보낼 조회 문자열 — utm 셋만. 나머지(토큰 등)는 서버로 보내지도 않는다. */
export function utmOnly(search: string): string {
  const params = new URLSearchParams(search);
  const kept = UTM_KEYS.flatMap((key) => {
    const value = params.get(key);
    return value ? [[key, value] as [string, string]] : [];
  });
  return new URLSearchParams(kept).toString();
}

export type Utm = { source: string | null; medium: string | null; campaign: string | null };

export function utmFrom(search: string): Utm {
  const params = new URLSearchParams(search);
  const pick = (key: (typeof UTM_KEYS)[number]) => {
    const value = params.get(key)?.trim().toLowerCase();
    return value ? value.slice(0, 80) : null;
  };
  return { source: pick("utm_source"), medium: pick("utm_medium"), campaign: pick("utm_campaign") };
}

export type Device = "mobile" | "tablet" | "desktop";

export function deviceFrom(ua: string): Device {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

export type Browser = "chrome" | "safari" | "edge" | "firefox" | "samsung" | "kakaotalk" | "naver" | "other";

/** 순서가 중요하다 — 앱 안 브라우저·삼성·엣지는 UA 에 Chrome/Safari 도 함께 적는다. */
const BROWSER_RULES: ReadonlyArray<[RegExp, Browser]> = [
  [/KAKAOTALK/i, "kakaotalk"],
  [/NAVER\(inapp/i, "naver"],
  [/SamsungBrowser/i, "samsung"],
  [/Edg(e|A|iOS)?\//i, "edge"],
  [/Firefox|FxiOS/i, "firefox"],
  [/Chrome|CriOS/i, "chrome"],
  [/Safari/i, "safari"],
];

export function browserFrom(ua: string): Browser {
  return BROWSER_RULES.find(([pattern]) => pattern.test(ua))?.[1] ?? "other";
}

// `scrap` 은 카카오톡 링크 미리보기, `Yeti` 는 네이버, `Daum/` 은 다음 검색 봇(다음 앱 `DaumApps` 는 사람).
const BOT = /bot|crawl|spider|slurp|scrap|preview|headless|lighthouse|facebookexternalhit|yeti|daum\/|curl\/|wget\/|python|node-fetch|axios/i;

export function isBot(ua: string): boolean {
  return !ua.trim() || BOT.test(ua);
}

/**
 * Caddy 가 앞단이다. 요청자가 보낸 x-forwarded-for 앞쪽은 지어낼 수 있으므로
 * **Caddy 가 붙인 마지막 값**을 쓴다.
 */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const last = headers.get("x-forwarded-for")?.split(",").map((part) => part.trim()).filter(Boolean).at(-1);
  return last ?? headers.get("x-real-ip") ?? null;
}
