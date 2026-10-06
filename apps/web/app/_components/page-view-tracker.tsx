"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { isTrackedPath, utmOnly } from "../../lib/analytics/normalize";

/**
 * **방문 통계 보내기**(계획 2026-10-06 site-analytics).
 *
 * 화면이 바뀔 때마다 `/api/track` 으로 한 줄. 이 탭의 첫 화면만 「어디서 왔나」(referrer)와 광고
 * 꼬리표(utm 셋만)를 싣는다 — 그 뒤 화면 이동의 referrer 는 늘 첫 값 그대로라 뜻이 없다.
 *
 * 쿠키·브라우저 저장소를 직접 만지지 않는다(시험이 본다). 동의한 브라우저의 번호표(fx_vid)는
 * 같은 사이트 요청이라 브라우저가 알아서 같이 보낸다. 실패해도 아무 일 없다.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!pathname) return;
    const entry = first.current;
    first.current = false;
    if (!isTrackedPath(pathname)) return;
    const body = entry
      ? { path: pathname, entry, referrer: document.referrer, search: utmOnly(window.location.search) }
      : { path: pathname, entry };
    send(JSON.stringify(body));
  }, [pathname]);

  return null;
}

function send(body: string) {
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
  } catch {
    // 통계 때문에 화면을 깨지 않는다.
  }
}
