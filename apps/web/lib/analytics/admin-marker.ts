import "server-only";

import { headers } from "next/headers";
import { isLocalAuthBypass } from "../dev-auth";
import { browserFrom, clientIp, deviceFrom } from "./normalize";
import { recordPageView } from "./record";
import { visitorHash } from "./visitor";

/**
 * **관리자 표시 줄 하나**(계획 2026-10-06 site-analytics).
 *
 * 보고서는 「그날 관리자 번호가 붙은 줄」이 있어야 같은 visitor 의 로그인 전 줄까지 뺀다. 그런데 `/admin*` 은
 * 화면에서 보내지 않으므로, 관리자가 `/` → `/login` → `/admin` 으로만 다니면 번호 붙은 줄이 없어 로그인 전
 * 방문이 숫자에 섞인다. 그래서 관리자 화면을 열 때 서버가 직접 한 줄 남긴다. 이 줄 자체도 모든 숫자에서 빠진다.
 * 던지지 않는다(통계 때문에 관리자 화면이 깨지면 안 된다).
 */
export async function markAdminVisit(userId: string): Promise<void> {
  if (isLocalAuthBypass) return;
  try {
    const h = await headers();
    const userAgent = (h.get("user-agent") ?? "").slice(0, 512);
    await recordPageView({
      visitor: visitorHash(clientIp(h), userAgent),
      userId,
      cookieId: null,
      path: "/admin",
      referrerHost: null,
      utm: { source: null, medium: null, campaign: null },
      device: deviceFrom(userAgent),
      browser: browserFrom(userAgent),
      entry: false,
    });
  } catch {
    // 기록 실패는 조용히 넘긴다. recordPageView 가 이미 경고를 남긴다.
  }
}
