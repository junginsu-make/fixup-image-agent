import { z } from "zod";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, clearCookie, readCookie, setCookie, validVisitorId,
} from "../../../../lib/analytics/consent";
import { clientIp } from "../../../../lib/analytics/normalize";
import { forgetCookie, linkCookie } from "../../../../lib/analytics/record";
import { publicOrigin } from "../../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **방문 통계 쿠키 동의·거부**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * 동의 띠와 「방문 통계 설정」이 부른다. 거부는 **DB 에서 먼저 잊고** 쿠키를 지운다 — 거꾸로 하면
 * 잊기가 실패했을 때 번호를 잃어 다시는 지울 수 없다.
 */
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

export async function POST(req: Request) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new Response(null, { status: 403 });
  const consent = await readChoice(req);
  if (consent === null) return new Response(null, { status: 400 });

  const secure = isSecure(req);
  const existing = validVisitorId(readCookie(req.headers.get("cookie"), VISITOR_COOKIE));
  return consent ? agree(req, existing, secure) : refuse(existing, secure);
}

async function agree(req: Request, existing: string | null, secure: boolean): Promise<Response> {
  const cookieId = existing ?? crypto.randomUUID();
  // /api/track 과 같은 값으로 잇는다 — 하루 방문자 값이 IP·브라우저 정보로 만들어진다.
  await linkCookie({ cookieId, ip: clientIp(req.headers), userAgent: (req.headers.get("user-agent") ?? "").slice(0, 512) });
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
