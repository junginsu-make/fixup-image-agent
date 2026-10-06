import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { CalendarDays, Clock, Cookie, Eye, Layers, Repeat, UserCheck, Users } from "lucide-react";
import { change } from "../../../lib/analytics/compare";
import type { DailyVisit, SiteTraffic } from "../../../lib/analytics/report";
import { StatTile } from "./stat-tile";
import { TrendChart } from "./trend-chart";

const count = (value: number) => value.toLocaleString("ko-KR");
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function duration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}분 ${total % 60}초` : `${total}초`;
}

/**
 * **얼마나 오나**(계획 2026-10-06 site-analytics). 숫자 여덟(지난 기간 대비 증감)과 일별 그래프.
 * 섞어 쓰기의 한계를 화면에 적는다 — 비회원은 하루 단위, 여러 날은 쿠키에 동의한 브라우저만.
 */
export function TrafficPanel({ report, previous = null }: { report: SiteTraffic | null; previous?: SiteTraffic | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>방문</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {report ? <TrafficNumbers report={report} previous={previous} /> : (
          <p className="text-sm text-muted-foreground">
            방문 보고를 읽지 못했습니다. Supabase 에 `202610060002_site_analytics_report.sql` 을 적용하기 전이거나, 잠시 연결이 안 된 경우일 수 있습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrafficNumbers({ report, previous }: { report: SiteTraffic; previous: SiteTraffic | null }) {
  return (
    <>
      <TrafficTiles report={report} previous={previous} />
      <p className="text-xs text-muted-foreground">화면을 하나만 보고 떠난 방문은 머문 시간을 0초로 세서, 평균 시간은 실제보다 짧게 나옵니다.</p>
      <TrendChart daily={report.daily} />
      <p className="text-xs text-muted-foreground">
        비회원은 하루 단위로만 같은 사람을 알아봅니다(같은 사람이 이틀 오면 2). 여러 날을 잇는 숫자는 방문 통계 쿠키에
        동의한 브라우저만 셉니다. 동의율이 낮으면 실제보다 작습니다. 회원은 기간 전체에서 한 번만 셉니다. 관리자 방문은 뺐습니다.
      </p>
      <DailyTable daily={report.daily} />
    </>
  );
}

/** 숫자 칸 여덟. 기간 숫자 셋은 지난 기간과, 오늘 방문자는 어제 하루와 견준다(못 읽었으면 배지 없음). */
function TrafficTiles({ report, previous }: { report: SiteTraffic; previous: SiteTraffic | null }) {
  const versus = (current: number, before: number | undefined) => change(current, before ?? null);
  const hint = previous ? `지난 ${report.days}일 같은 시각까지 대비` : undefined;
  const yesterday = report.daily.length >= 2 ? report.daily[report.daily.length - 2]!.visitors : undefined;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile icon={Users} label="오늘 방문자" value={count(report.todayVisitors)}
        change={versus(report.todayVisitors, yesterday)} hint={yesterday === undefined ? undefined : "어제 하루 전체 대비"} />
      <StatTile icon={CalendarDays} label={`최근 ${report.days}일 방문(하루 단위 합)`} value={count(report.visitorDays)}
        change={versus(report.visitorDays, previous?.visitorDays)} hint={hint} />
      <StatTile icon={UserCheck} label={`최근 ${report.days}일 들어온 회원`} value={count(report.members)}
        change={versus(report.members, previous?.members)} hint={hint} />
      <StatTile icon={Eye} label="화면 본 횟수" value={count(report.views)} change={versus(report.views, previous?.views)} hint={hint} />
      <StatTile icon={Clock} label="한 번 올 때 머문 시간(평균)" value={duration(report.avgSessionSeconds)} />
      <StatTile icon={Layers} label="한 번 올 때 본 화면(평균)" value={String(report.avgViewsPerSession)} />
      <StatTile icon={Cookie} label="방문 통계 쿠키 동의율" value={percent(report.consentRate)} />
      <StatTile icon={Repeat} label="여러 날 다시 온 브라우저(동의자)" value={`${count(report.returningBrowsers)} / ${count(report.knownBrowsers)}`} />
    </dl>
  );
}

function DailyTable({ daily }: { daily: DailyVisit[] }) {
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">일별 표</summary>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            {["날짜", "방문자", "회원", "화면", "가입"].map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {[...daily].reverse().map((day) => (
            <tr key={day.day} className="border-t">
              <td className="py-1 pr-3">{day.day}</td>
              <td className="py-1 pr-3">{count(day.visitors)}</td>
              <td className="py-1 pr-3">{count(day.members)}</td>
              <td className="py-1 pr-3">{count(day.views)}</td>
              <td className="py-1">{count(day.signups)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
