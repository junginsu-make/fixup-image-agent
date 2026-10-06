import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { Slice, SiteTraffic } from "../../../lib/analytics/report";
import { browserLabel, deviceLabel, pageLabel, sourceLabel } from "./labels";
import { RankList } from "./rank-list";

const count = (value: number) => value.toLocaleString("ko-KR");
const views = (row: Slice) => row.views;
const visitors = (row: Slice) => row.visitors;
const asIs = (key: string) => key;
const visitorNote = (row: Slice) => `방문자 ${count(row.visitors)}명`;
const viewNote = (row: Slice) => `화면 ${count(row.views)}번`;
/** 화면 목록은 한글 이름 아래 원래 주소를 작게 둔다. 이름을 못 붙인 주소는 두 번 쓰지 않는다. */
const pageNote = (row: Slice) => (pageLabel(row.key) === row.key ? visitorNote(row) : `${row.key} · ${visitorNote(row)}`);

/**
 * **어디서 와서 어디를 보나**(계획 2026-10-06 site-analytics). 유입은 첫 화면 줄만 센다.
 * 줄 세우는 숫자는 RPC 가 정렬한 숫자와 같다(경로·화면은 횟수, 기기·브라우저는 방문자).
 */
export function SourcesPanel({ report }: { report: SiteTraffic | null }) {
  if (!report) return null;
  return (
    <Card>
      <CardHeader><CardTitle>들어온 경로와 많이 본 화면</CardTitle></CardHeader>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <RankList title="들어온 경로" rows={report.sources} value={views} label={sourceLabel} sublabel={visitorNote} unit="번" />
        <RankList title="광고 캠페인(utm_campaign)" rows={report.campaigns} value={views} label={asIs} sublabel={visitorNote} unit="번" />
        <RankList title="처음 연 화면" rows={report.landingPages} value={views} label={pageLabel} sublabel={pageNote} unit="번" />
        <RankList title="많이 본 화면" rows={report.pages} value={views} label={pageLabel} sublabel={pageNote} unit="번" total={report.views} />
        <RankList title="기기" rows={report.devices} value={visitors} label={deviceLabel} sublabel={viewNote} unit="명" />
        <RankList title="브라우저" rows={report.browsers} value={visitors} label={browserLabel} sublabel={viewNote} unit="명" />
      </CardContent>
    </Card>
  );
}
