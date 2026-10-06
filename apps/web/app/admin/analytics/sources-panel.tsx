import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { Slice, SiteTraffic } from "../../../lib/analytics/report";
import { browserLabel, deviceLabel, sourceLabel } from "./labels";

/** **어디서 와서 어디를 보나**(계획 2026-10-06 site-analytics). 유입은 첫 화면 줄만 센다. */
export function SourcesPanel({ report }: { report: SiteTraffic | null }) {
  if (!report) return null;
  return (
    <Card>
      <CardHeader><CardTitle>들어온 경로와 많이 본 화면</CardTitle></CardHeader>
      <CardContent className="grid gap-6 xl:grid-cols-2">
        <SliceTable title="들어온 경로" rows={report.sources} label={sourceLabel} first="경로" />
        <SliceTable title="광고 캠페인(utm_campaign)" rows={report.campaigns} label={(key) => key} first="캠페인" />
        <SliceTable title="처음 연 화면" rows={report.landingPages} label={(key) => key} first="화면" />
        <SliceTable title="많이 본 화면" rows={report.pages} label={(key) => key} first="화면" />
        <SliceTable title="기기" rows={report.devices} label={deviceLabel} first="기기" />
        <SliceTable title="브라우저" rows={report.browsers} label={browserLabel} first="브라우저" />
      </CardContent>
    </Card>
  );
}

function SliceTable({ title, rows, label, first }: { title: string; rows: Slice[]; label: (key: string) => string; first: string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{first}</th>
              <th className="py-1 pr-3 font-medium">횟수</th>
              <th className="py-1 font-medium">방문자</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t">
                <td className="break-all py-1 pr-3">{label(row.key)}</td>
                <td className="py-1 pr-3">{row.views.toLocaleString("ko-KR")}</td>
                <td className="py-1">{row.visitors.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
