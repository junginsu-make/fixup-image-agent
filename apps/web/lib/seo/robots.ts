/**
 * **검색 로봇 안내(robots.txt)**(계획 2026-10-06 seo-search-registration).
 *
 * Next 의 `robots.ts` 는 주석 줄을 못 넣는다. 다음 웹마스터도구는 소유 확인을 robots.txt 의
 * `#DaumWebMasterTool:…` 한 줄로 하므로 글을 직접 만든다.
 *
 * 막는 것: 회원 화면·관리자·API·로그인 처리 주소. 로그인·가입·비밀번호 화면은 막지 않는다 —
 * 막으면 로봇이 그 화면의 「noindex」를 못 읽어 주소만 색인될 수 있다.
 */
export const PRIVATE_PREFIXES = [
  "/api/",
  "/auth/",
  "/admin",
  "/create",
  "/sns",
  "/poster",
  "/redesign",
  "/characters",
  "/library",
  "/settings",
  "/easy",
  "/ad",
  "/onboarding",
  "/access",
  "/inbox",
  "/sources",
  "/team",
] as const;

/** `/api/` 막기 안에서도 열어 둘 길 — 첫 화면 캐러셀 그림(로그인 없이 읽는다, `api/showcase/[id]/file`). */
export const PUBLIC_API_PREFIXES = ["/api/showcase/"] as const;

const DAUM_PIN = /^#DaumWebMasterTool:[^\s]+$/;

export function robotsTxt({
  siteUrl,
  daumPin = "",
  disallow = PRIVATE_PREFIXES,
}: {
  siteUrl: string;
  daumPin?: string;
  disallow?: readonly string[];
}): string {
  const pin = daumPin.trim();
  if (pin && !DAUM_PIN.test(pin)) throw new Error("다음 확인 값은 #DaumWebMasterTool: 로 시작하는 한 줄이어야 합니다");
  return [
    ...(pin ? [pin] : []),
    "User-agent: *",
    "Allow: /",
    ...PUBLIC_API_PREFIXES.map((prefix) => `Allow: ${prefix}`),
    ...disallow.map((prefix) => `Disallow: ${prefix}`),
    "",
    `Sitemap: ${siteUrl}/sitemap.xml`,
    "",
  ].join("\n");
}
