import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { DailyVisit, SiteTraffic } from "../../../lib/analytics/report";

const count = (value: number) => value.toLocaleString("ko-KR");
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export function duration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}분 ${total % 60}초` : `${total}초`;
}

/**
 * **얼마나 오나**(계획 2026-10-06 site-analytics). 숫자 여덟과 일별 막대.
 * 섞어 쓰기의 한계를 화면에 적는다 — 비회원은 하루 단위, 여러 날은 쿠키에 동의한 브라우저만.
 */
export function TrafficPanel({ report }: { report: SiteTraffic | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>방문</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {report ? <TrafficNumbers report={report} /> : (
          <p className="text-sm text-muted-foreground">
            방문 보고를 읽지 못했습니다. Supabase 에 `202610060002_site_analytics_report.sql` 을 먼저 적용해야 합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TrafficNumbers({ report }: { report: SiteTraffic }) {
  const tiles: Array<[string, string]> = [
    ["오늘 방문자", count(report.todayVisitors)],
    [`최근 ${report.days}일 방문(하루 단위 합)`, count(report.visitorDays)],
    [`최근 ${report.days}일 들어온 회원`, count(report.members)],
    ["화면 본 횟수", count(report.views)],
    ["한 번 올 때 머문 시간(평균)", duration(report.avgSessionSeconds)],
    ["한 번 올 때 본 화면(평균)", String(report.avgViewsPerSession)],
    ["방문 통계 쿠키 동의율", percent(report.consentRate)],
    ["여러 날 다시 온 브라우저(동의자)", `${count(report.returningBrowsers)} / ${count(report.knownBrowsers)}`],
  ];
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <DailyBars daily={report.daily} />
      <p className="text-xs text-muted-foreground">
        비회원은 하루 단위로만 같은 사람을 알아봅니다(같은 사람이 이틀 오면 2). 여러 날을 잇는 숫자는 방문 통계 쿠키에
        동의한 브라우저만 셉니다 — 동의율이 낮으면 실제보다 작습니다. 회원은 기간 전체에서 한 번만 셉니다. 관리자 방문은 뺐습니다.
      </p>
      <DailyTable daily={report.daily} />
    </>
  );
}

function DailyBars({ daily }: { daily: DailyVisit[] }) {
  const max = Math.max(1, ...daily.map((day) => day.visitors));
  return (
    <div className="flex h-32 items-end gap-px" role="img" aria-label={`일별 방문자 ${daily.length}일`}>
      {daily.map((day) => (
        <div
          key={day.day}
          title={`${day.day} · 방문 ${day.visitors} · 회원 ${day.members} · 가입 ${day.signups}`}
          className="flex-1 rounded-t-sm bg-primary/70"
          style={{ height: `${Math.max(2, (day.visitors / max) * 100)}%` }}
        />
      ))}
    </div>
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
