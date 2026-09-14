/**
 * 로그인한 사람이 처음 보는 곳.
 *
 * 상세페이지 만들기 → 라이브러리 → 설명서 순으로 옮겨 왔다.
 *
 * 만들기부터 열면 재료가 뭐가 있는지 모르는 채로 시작한다. 그래서 가진 것을
 * 먼저 보여 주려고 라이브러리로 옮겼다. 그런데 라이브러리도 **무엇을 하는
 * 도구인지 아는 사람**에게나 쓸모가 있다. 처음 온 사람은 재료를 봐도 그걸로
 * 뭘 할 수 있는지 모른다.
 *
 * 설명서를 첫 화면으로 둔다. 여기서 도구마다 무엇을 하는지 보고, 각 설명서
 * 끝의 버튼으로 그 도구에 바로 들어간다. 사이드바에서도 맨 위에 있다.
 *
 * 여러 곳에서 같은 곳으로 보내야 해서 한 자리에 둔다 — 로그인 화면,
 * 미들웨어, 로컬 우회, 랜딩의 「스튜디오 열기」.
 */
export const HOME_AFTER_LOGIN = "/guide";

/** Return a normalized local path; query decoding must not create another origin. */
export function safeNext(next: string | null | undefined, fallback = HOME_AFTER_LOGIN): string {
  if (!next) return fallback;
  const base = "https://navigation.invalid";
  const valid = (value: string) => {
    if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return false;
    const url = new URL(value, base);
    return url.origin === base && !url.pathname.startsWith("//");
  };
  try {
    let decoded = next;
    for (let depth = 0; depth < 8; depth++) {
      if (!valid(decoded)) return fallback;
      const again = decodeURIComponent(decoded);
      if (again === decoded) {
        const result = new URL(next, base);
        return result.pathname + result.search + result.hash;
      }
      decoded = again;
    }
  } catch { /* malformed URL or escape */ }
  return fallback;
}

/** Production redirects use only the configured origin, never proxy input. */
export function canonicalOrigin(value: string | undefined, production = process.env.NODE_ENV === "production"): string {
  if (!value || value !== value.trim() || /[\\\x00-\x20\x7f]/.test(value)) throw new Error("invalid_site_origin");
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && !production && loopback))
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("invalid_site_origin");
  return url.origin;
}

export function publicOrigin(_headers: { get(name: string): string | null }, fallback: string): string {
  if (process.env.NODE_ENV === "production") return canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL, true);
  // Local development uses its actual port even when a production .env is present.
  const local = new URL(fallback);
  if (["localhost", "127.0.0.1", "[::1]"].includes(local.hostname)) return canonicalOrigin(local.origin, false);
  return canonicalOrigin(process.env.NEXT_PUBLIC_SITE_URL, false);
}
