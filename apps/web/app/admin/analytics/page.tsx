import Link from "next/link";
import { pruneAnalytics } from "../../../lib/analytics/record";
import { canCompare, trackingNote } from "../../../lib/analytics/compare";
import {
  getSitePeople, getSitePeopleBefore, getSiteTraffic, getSiteTrafficBefore, getTrackingStart,
  type SitePeople, type SiteTraffic,
} from "../../../lib/analytics/report";
import { PeoplePanel } from "./people-panel";
import { ANALYTICS_RANGES, pickDays } from "./range";
import { SourcesPanel } from "./sources-panel";
import { TrafficPanel } from "./traffic-panel";

export const dynamic = "force-dynamic";

/**
 * 방문 분석 탭(`/admin/analytics`, 계획 2026-10-06 site-analytics).
 * 관리자 확인은 `admin/layout.tsx` 의 `requireAdmin()` 이 한다. 열 때마다 보유기간 지난 줄을 지운다
 * (기다리지 않는다 — 못 지워도 화면은 열린다).
 */
export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = pickDays((await searchParams).days);
  void pruneAnalytics();
  const now = new Date();
  const [traffic, people, previous] = await Promise.all([getSiteTraffic(days, now), getSitePeople(days, now), loadPrevious(days, now)]);
  return (
    <div className="space-y-6">
      <nav className="flex gap-2 text-sm" aria-label="보기 기간">
        {ANALYTICS_RANGES.map((range) => (
          <Link
            key={range}
            href={`/admin/analytics?days=${range}`}
            aria-current={range === days ? "page" : undefined}
            className={`rounded-md border px-3 py-1 ${range === days ? "bg-foreground text-background" : "hover:bg-muted"}`}
          >
            최근 {range}일
          </Link>
        ))}
      </nav>
      {previous.note ? <p className="break-keep text-xs text-muted-foreground">{previous.note}</p> : null}
      <TrafficPanel report={traffic} previous={previous.traffic} />
      <SourcesPanel report={traffic} />
      <PeoplePanel report={people} previous={previous.people} />
    </div>
  );
}

interface Previous { traffic: SiteTraffic | null; people: SitePeople | null; note: string | null }

/**
 * 앞선 기간 보고. 앞선 창 전체가 방문 기록 시작 뒤에 있을 때만 읽는다(`canCompare`). 아니면 증감 없이
 * 안내 한 줄만 준다. 무엇이 실패해도 던지지 않는다 — 증감만 빠지고 이번 기간 화면은 그대로 열린다.
 */
async function loadPrevious(days: number, now: Date): Promise<Previous> {
  try {
    const trackingStart = await getTrackingStart();
    if (!canCompare(days, now, trackingStart)) return { traffic: null, people: null, note: trackingNote(days, trackingStart) };
    const [traffic, people] = await Promise.all([getSiteTrafficBefore(days, now), getSitePeopleBefore(days, now)]);
    return { traffic, people, note: null };
  } catch {
    return { traffic: null, people: null, note: null };
  }
}
