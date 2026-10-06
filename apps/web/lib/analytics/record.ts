import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import type { Browser, Device, Utm } from "./normalize";
import { ANALYTICS_KEEP_DAYS } from "./retention";

/**
 * **방문 기록을 DB 에 남기고, 잇고, 잊는다**(계획 2026-10-06 site-analytics).
 *
 * 기록·잇기는 던지지 않는다 — 통계 때문에 화면이 깨지면 안 된다. **잊기(거부)만 성공 여부를 돌려준다** —
 * 철회를 못 지킨 채 「됐다」고 하면 안 된다. 경고는 10분에 한 번, 방문 내용(IP·주소·번호)은 싣지 않는다.
 */
export type PageView = {
  ip: string | null;
  userAgent: string;
  userId: string | null;
  cookieId: string | null;
  path: string;
  referrerHost: string | null;
  utm: Utm;
  device: Device;
  browser: Browser;
  entry: boolean;
};

const WARN_EVERY_MS = 10 * 60_000;
const PRUNE_EVERY_MS = 60 * 60_000;
// 상태 보관 자리 둘. 프로세스 하나에 하나씩.
let lastWarnAt = 0;
let lastPruneAt = 0;

function warn(cause: unknown, now = Date.now()) {
  if (now - lastWarnAt < WARN_EVERY_MS) return;
  lastWarnAt = now;
  console.warn("[analytics] 방문 기록을 다루지 못했습니다", { message: cause instanceof Error ? cause.message : String(cause) });
}

async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function recordPageView(view: PageView): Promise<void> {
  try {
    await call("analytics_record", {
      p_ip: view.ip,
      p_ua: view.userAgent,
      p_user: view.userId,
      p_path: view.path,
      p_referrer_host: view.referrerHost,
      p_utm_source: view.utm.source,
      p_utm_medium: view.utm.medium,
      p_utm_campaign: view.utm.campaign,
      p_device: view.device,
      p_browser: view.browser,
      p_entry: view.entry,
      p_cookie: view.cookieId,
    });
  } catch (error) {
    warn(error);
  }
}

/** 동의한 순간, 오늘 같은 방문자의 앞선 줄(첫 화면·유입 경로)에 번호를 잇는다. */
export async function linkCookie({ cookieId, ip, userAgent }: { cookieId: string; ip: string | null; userAgent: string }): Promise<void> {
  try {
    await call("analytics_link_cookie", { p_cookie: cookieId, p_ip: ip, p_ua: userAgent });
  } catch (error) {
    warn(error);
  }
}

/** 거부·철회 — 그 번호를 모든 줄에서 지운다. 실패하면 false(부르는 쪽이 쿠키를 지우지 않고 다시 시도하게 한다). */
export async function forgetCookie(cookieId: string): Promise<boolean> {
  try {
    await call("analytics_forget", { p_cookie: cookieId });
    return true;
  } catch (error) {
    warn(error);
    return false;
  }
}

/** 보유기간이 지난 줄을 지운다. 못 지우면 null — 부르는 쪽은 기다리지 않는다. */
export async function pruneAnalytics(): Promise<number | null> {
  try {
    return Number((await call("analytics_prune", { p_keep_days: ANALYTICS_KEEP_DAYS })) ?? 0);
  } catch (error) {
    warn(error);
    return null;
  }
}

/**
 * 한 시간에 한 번만 지운다. 따로 도는 예약 작업(cron)이 없어서 **방문이 들어올 때** 겸사겸사 한다
 * (관리자 탭을 열 때도 한다 — 2단계).
 */
export function pruneSoon(now: number = Date.now()): void {
  if (now - lastPruneAt < PRUNE_EVERY_MS) return;
  lastPruneAt = now;
  void pruneAnalytics();
}
