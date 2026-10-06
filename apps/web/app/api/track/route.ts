import { z } from "zod";
import {
  ANALYTICS_COOKIE_DAYS, CONSENT_COOKIE, VISITOR_COOKIE, consentFrom, readCookie, setCookie, validVisitorId,
} from "../../../lib/analytics/consent";
import {
  browserFrom, clientIp, deviceFrom, isBot, isTrackedPath, normalizePath, referrerHost, utmFrom,
} from "../../../lib/analytics/normalize";
import { createLimiter } from "../../../lib/analytics/rate-limit";
import { pruneSoon, recordPageView } from "../../../lib/analytics/record";
import { currentUserId } from "../../../lib/analytics/viewer";
import { publicOrigin } from "../../../lib/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * **방문 한 줄 받기**(계획 2026-10-06 site-analytics).
 *
 * 무슨 일이 있어도 204 다. 화면은 답을 기다리지 않고(sendBeacon), 거절 이유를 알려 줘 봐야
 * 장난치는 쪽만 돕는다. 화면이 보낸 값은 믿지 않고 `normalize.ts` 로 다시 줄인다.
 */
const NO_CONTENT = () => new Response(null, { status: 204 });
const MAX_BODY = 4_096;
const allow = createLimiter({ limit: 120, windowMs: 60_000, maxKeys: 5_000 });

const 방문 = z.object({
  path: z.string().min(1).max(2_000),
  entry: z.boolean(),
  referrer: z.string().max(2_000).optional(),
  search: z.string().max(2_000).optional(),
}).strict();

async function readVisit(req: Request) {
  // 선언된 크기가 크면 읽기 전에 버린다(읽은 뒤 길이 검사는 그대로 둔다 — 선언은 거짓일 수 있다).
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) return null;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const parsed = 방문.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 사람이 우리 화면에서 보낸 것인가. 아니면 조용히 버린다. */
function acceptable(req: Request, userAgent: string, ip: string | null): boolean {
  if (isBot(userAgent)) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  return allow(ip ?? "unknown");
}

/** 동의한 브라우저의 번호표. 동의했는데 번호가 없거나 모양이 틀리면 새로 만든다 — 그때만 issue. */
function visitorCookie(req: Request): { cookieId: string | null; issue: boolean } {
  const header = req.headers.get("cookie");
  if (consentFrom(readCookie(header, CONSENT_COOKIE)) !== "yes") return { cookieId: null, issue: false };
  const known = validVisitorId(readCookie(header, VISITOR_COOKIE));
  return known ? { cookieId: known, issue: false } : { cookieId: crypto.randomUUID(), issue: true };
}

async function handle(req: Request): Promise<Response> {
  const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 512);
  const ip = clientIp(req.headers);
  if (!acceptable(req, userAgent, ip)) return NO_CONTENT();

  const visit = await readVisit(req);
  const path = visit ? normalizePath(visit.path) : null;
  if (!visit || !path || !isTrackedPath(path)) return NO_CONTENT();

  const origin = new URL(publicOrigin(req.headers, new URL(req.url).origin));
  const { cookieId, issue } = visitorCookie(req);
  await recordPageView({
    ip,
    userAgent,
    userId: await currentUserId(),
    cookieId,
    path,
    referrerHost: visit.entry ? referrerHost(visit.referrer, origin.host) : null,
    utm: utmFrom(visit.entry ? visit.search ?? "" : ""),
    device: deviceFrom(userAgent),
    browser: browserFrom(userAgent),
    entry: visit.entry,
  });
  pruneSoon();

  const response = NO_CONTENT();
  if (issue && cookieId) {
    response.headers.append("set-cookie", setCookie(VISITOR_COOKIE, cookieId, {
      secure: origin.protocol === "https:", httpOnly: true, days: ANALYTICS_COOKIE_DAYS,
    }));
  }
  return response;
}

/** 어떤 경우에도 204 — 주소 해석·본문 읽기·기록 어디서 던져도 화면은 모른다. */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch {
    return NO_CONTENT();
  }
}
