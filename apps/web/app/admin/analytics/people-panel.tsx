import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import type { SitePeople } from "../../../lib/analytics/report";
import { aiOperationLabel } from "../system/ai-labels";
import { providerLabel, sourceLabel } from "./labels";

const count = (value: number) => value.toLocaleString("ko-KR");
const seen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "—";
const list = (items: Array<{ key: string; members: number }>, label: (key: string) => string) =>
  items.length ? items.map((item) => `${label(item.key)} ${count(item.members)}명`).join(" · ") : "기록 없음";

/**
 * **누가 무엇을 쓰나**(계획 2026-10-06 site-analytics). 기능은 이미 쌓이고 있는 AI 호출 기록
 * (`ai_cost_events`, 2026-09-30 부터)으로 센다 — 새로 모으지 않는다.
 */
export function PeoplePanel({ report }: { report: SitePeople | null; previous?: SitePeople | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>회원과 기능</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        {report ? <PeopleBody report={report} /> : <p className="text-sm text-muted-foreground">회원 보고를 읽지 못했습니다.</p>}
      </CardContent>
    </Card>
  );
}

function PeopleBody({ report }: { report: SitePeople }) {
  const tiles: Array<[string, number]> = [
    [`최근 ${report.days}일 활동 회원`, report.activeMembers],
    ["그중 새로 가입", report.newMembers],
    ["그중 추천코드 입력", report.withReferral],
  ];
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{count(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1 text-sm">
        <p>가입 방법: {list(report.byProvider, providerLabel)}</p>
        <p>가입자가 처음 들어온 경로: {list(report.signupSources, sourceLabel)}</p>
      </div>
      <Table
        title="많이 쓴 기능(AI 호출 기준)"
        head={["기능", "횟수", "쓴 회원", "실패"]}
        rows={report.features.map((f) => [aiOperationLabel(f.key), count(f.calls), count(f.users), count(f.failed)])}
      />
      <Table
        title="많이 쓴 회원(상위 10)"
        head={["회원", "화면", "AI 호출", "마지막 방문"]}
        rows={report.topMembers.map((m) => [m.name ? `${m.name} (${m.email})` : m.email, count(m.views), count(m.calls), seen(m.lastSeen)])}
      />
    </>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground">{head.map((h) => <th key={h} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join("|")} className="border-t">{row.map((cell, i) => <td key={i} className="break-all py-1 pr-3">{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
