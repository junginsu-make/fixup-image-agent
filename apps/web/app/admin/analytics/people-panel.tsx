import { Card, CardContent, CardHeader, CardTitle } from "@fixup/ui";
import { Ticket, UserPlus, Users } from "lucide-react";
import { change } from "../../../lib/analytics/compare";
import type { FeatureUse, MemberUse, SitePeople } from "../../../lib/analytics/report";
import { aiOperationLabel } from "../system/ai-labels";
import { mergeByLabel, providerLabel, sourceLabel } from "./labels";
import { RankList } from "./rank-list";
import { previousHint, StatTile } from "./stat-tile";

const count = (value: number) => value.toLocaleString("ko-KR");
const seen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "기록 없음";
const members = (row: { members: number }) => row.members;
const calls = (row: FeatureUse) => row.calls;
const featureNote = (row: FeatureUse) => `쓴 회원 ${count(row.users)}명 · 실패 ${count(row.failed)}번`;

/**
 * **누가 무엇을 쓰나**(계획 2026-10-06 site-analytics). 기능은 이미 쌓이고 있는 AI 호출 기록
 * (`ai_cost_events`, 2026-09-30 부터)으로 센다 — 새로 모으지 않는다.
 */
export function PeoplePanel({ report, previous = null }: { report: SitePeople | null; previous?: SitePeople | null }) {
  return (
    <Card>
      <CardHeader><CardTitle>회원과 기능</CardTitle></CardHeader>
      <CardContent className="space-y-8">
        {report ? <PeopleBody report={report} previous={previous} /> : <p className="text-sm text-muted-foreground">회원 보고를 읽지 못했습니다.</p>}
      </CardContent>
    </Card>
  );
}

function PeopleBody({ report, previous }: { report: SitePeople; previous: SitePeople | null }) {
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label={`최근 ${report.days}일 활동 회원`} value={count(report.activeMembers)}
          change={change(report.activeMembers, previous?.activeMembers ?? null)}
          hint={previousHint(report.days, previous?.activeMembers, "명")} />
        <StatTile icon={UserPlus} label="그중 새로 가입" value={count(report.newMembers)} />
        <StatTile icon={Ticket} label="그중 추천코드 입력" value={count(report.withReferral)} />
      </dl>
      <div className="grid gap-8 lg:grid-cols-2">
        <RankList title="가입 방법" rows={report.byProvider} value={members} label={providerLabel} unit="명" />
        <RankList title="가입자가 처음 들어온 경로" rows={mergeByLabel(report.signupSources, sourceLabel, members)} value={members} label={sourceLabel} unit="명" />
      </div>
      <RankList title="많이 쓴 기능(AI 호출 기준)" rows={report.features} value={calls} label={aiOperationLabel} sublabel={featureNote} unit="번" />
      <TopMembers rows={report.topMembers} />
    </>
  );
}

/** 표 대신 줄 목록. 휴대폰에서도 이름·이메일이 줄바꿈되어 옆으로 넘치지 않는다. */
function TopMembers({ rows }: { rows: MemberUse[] }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">많이 쓴 회원(상위 10)</h3>
      {rows.length ? (
        <ol className="divide-y rounded-lg border">
          {rows.map((member) => (
            <li key={member.id || member.email} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <div className="min-w-0">
                {member.name ? <p className="break-keep font-medium [overflow-wrap:anywhere]">{member.name}</p> : null}
                <p className="break-all text-xs text-muted-foreground">{member.email}</p>
              </div>
              <p className="break-keep text-xs tabular-nums text-muted-foreground">
                화면 {count(member.views)}번 · AI {count(member.calls)}번 · 마지막 방문 {seen(member.lastSeen)}
              </p>
            </li>
          ))}
        </ol>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </section>
  );
}
