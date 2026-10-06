import Link from "next/link";
import { pruneAnalytics } from "../../../lib/analytics/record";
import { getSitePeople, getSiteTraffic } from "../../../lib/analytics/report";
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
  const [traffic, people] = await Promise.all([getSiteTraffic(days), getSitePeople(days)]);
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
      <TrafficPanel report={traffic} />
      <SourcesPanel report={traffic} />
      <PeoplePanel report={people} />
    </div>
  );
}
