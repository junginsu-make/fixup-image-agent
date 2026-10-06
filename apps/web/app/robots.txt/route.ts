import { robotsTxt } from "../../lib/seo/robots";
import { SEARCH_VERIFICATION, SITE_URL } from "../../lib/seo/site";

/** robots.txt — 글은 `lib/seo/robots.ts` 가 만든다(다음 확인 줄 때문에 직접 낸다). */
export const dynamic = "force-static";

export function GET(): Response {
  return new Response(robotsTxt({ siteUrl: SITE_URL, daumPin: SEARCH_VERIFICATION.daumPin }), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
