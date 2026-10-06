import { z } from "zod";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, clearCookie, readCookie, setCookie, validVisitorId,
} from "../../../../lib/analytics/consent";
import { clientIp } from "../../../../lib/analytics/normalize";
import { createLimiter } from "../../../../lib/analytics/rate-limit";
import { forgetCookie, linkCookie } from "../../../../lib/analytics/record";
import { currentUserId } from "../../../../lib/analytics/viewer";
import { visitorHash } from "../../../../lib/analytics/visitor";
import { publicOrigin } from "../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **방문 통계 쿠키 동의·거부**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * 동의 띠와 「방문 통계 설정」이 부른다. 거부는 **DB 에서 먼저 잊고** 쿠키를 지운다 — 거꾸로 하면
 * 잊기가 실패했을 때 번호를 잃어 다시는 지울 수 없다.
 *
 * 보안 검토 반영: 같은 사이트 화면이 보낸 JSON 만 받고(남의 사이트가 대신 눌러 주지 못하게), 한 IP 는
 * 1분에 10번까지다. 동의 때 앞선 기록을 잇는 일은 DB 를 건드리므로 열어 둘 수 없다.
 */
// 상태 보관 자리(프로세스 하나에 하나). 한 IP 가 1분에 10번.
const allow = createLimiter({ limit: 10, windowMs: 60_000, maxKeys: 5_000 });
const 선택 = z.object({ consent: z.boolean() }).strict();

async function readChoice(req: Request): Promise<boolean | null> {
  try {
    const parsed = 선택.safeParse(await req.json());
    return parsed.success ? parsed.data.consent : null;
  } catch {
    return null;
  }
}

/** 프록시가 보낸 주소가 망가져도(`x-forwarded-proto: "ht tp"` 등) 던지지 않고 요청 주소의 방식으로 돌아간다. */
function isSecure(req: Request): boolean {
  const own = new URL(req.url);
  try {
    return new URL(publicOrigin(req.headers, own.origin)).protocol === "https:";
  } catch {
    return own.protocol === "https:";
  }
}

/** 우리 화면에서 보낸 요청인가. 브라우저가 알려 주는 `sec-fetch-site` 가 먼저, 없으면 `origin` 의 주소로 본다. */
function sameSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const own = new URL(publicOrigin(req.headers, new URL(req.url).origin));
    return new URL(origin).host === own.host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameSite(req)) return new Response(null, { status: 403 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return new Response(null, { status: 415 });
  }
  // 횟수는 같은 사이트의 요청만 센다 — 남의 사이트가 피해자 IP 의 몫을 태워 거부를 막지 못하게.
  if (!allow(clientIp(req.headers) ?? "unknown")) return new Response(null, { status: 429 });
  const consent = await readChoice(req);
  if (consent === null) return new Response(null, { status: 400 });

  const secure = isSecure(req);
  const existing = validVisitorId(readCookie(req.headers.get("cookie"), VISITOR_COOKIE));
  return consent ? agree(req, existing, secure) : refuse(existing, secure);
}

async function agree(req: Request, existing: string | null, secure: boolean): Promise<Response> {
  const cookieId = existing ?? crypto.randomUUID();
  // /api/track 과 같은 값으로 잇는다 — 하루 방문자 값(IP·브라우저 정보를 서버 메모리 열쇠로 섞은 것).
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);
  await linkCookie({ cookieId, visitor: visitorHash(clientIp(req.headers), userAgent), userId: await currentUserId() });
  const response = new Response(null, { status: 204 });
  response.headers.append("set-cookie", setCookie(CONSENT_COOKIE, "1", { secure, httpOnly: false, days: ANALYTICS_COOKIE_DAYS }));
  if (!existing) {
    response.headers.append("set-cookie", setCookie(VISITOR_COOKIE, cookieId, { secure, httpOnly: true, days: ANALYTICS_COOKIE_DAYS }));
  }
  return response;
}

async function refuse(existing: string | null, secure: boolean): Promise<Response> {
  if (existing && !(await forgetCookie(existing))) {
    return Response.json({ ok: false, message: "잠시 뒤 다시 눌러 주세요." }, { status: 503 });
  }
  const response = new Response(null, { status: 204 });
  response.headers.append("set-cookie", setCookie(CONSENT_COOKIE, "0", { secure, httpOnly: false, days: ANALYTICS_COOKIE_DAYS }));
  response.headers.append("set-cookie", clearCookie(VISITOR_COOKIE, secure));
  return response;
}
