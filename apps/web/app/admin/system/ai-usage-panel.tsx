import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@fixup/ui";
import { formatKrw, formatUsd } from "../../../lib/cost";
import { aiOperationLabel, aiProviderLabel } from "./ai-labels";
import type { AiCostReport, AiCostSlice } from "../../../lib/ai-control/report";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import { setAiPausedAction } from "./ai-control-actions";

/**
 * **AI 사용 비용 + 전체 멈춤 스위치**(설계 2026-09-30 §3.3·§3.4 · C4).
 *
 * 보고 바로 결정하도록 숫자와 스위치를 한 카드에 둔다. 숫자는 `ai_cost_events`(호출마다 한 줄)를
 * **한국 시각**으로 모은 것이다. 자동으로 멈추는 것은 없다(D2) — 사람만 누른다.
 */
export function AiUsagePanel({ report, paused, usdKrw }: { report: AiCostReport | null; paused: boolean | null; usdKrw: number }) {
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>AI 사용 비용</CardTitle>
          <CardDescription>
            공급자를 부를 때마다 한 줄씩 적은 값을 한국 시각으로 모았습니다. 단가표가 맞아야 맞으며,
            공급자 청구서와 1원 단위로 같지는 않습니다.
          </CardDescription>
        </div>
        <PauseSwitch paused={paused} />
      </CardHeader>
      <CardContent className="space-y-5">
        {report ? <Numbers report={report} usdKrw={usdKrw} /> : (
          <p className="text-sm text-muted-foreground">아직 집계할 수 없습니다. 비용 표 마이그레이션이 적용됐는지 확인해 주세요.</p>
        )}
      </CardContent>
    </Card>
  );
}

function PauseSwitch({ paused }: { paused: boolean | null }) {
  if (paused === null) {
    /*
      **상태를 못 읽으면 단추를 숨긴다**(설계 2026-09-30 §3.3). 「켜짐」이라고 잘못 보이면
      관리자가 실제로는 멈춰 있는 걸 모르고 지나치고, 「멈춤」이라고 잘못 보이면 멀쩡히
      도는 서비스를 급하게 건드리게 된다 — 틀린 상태를 보이느니 모른다고 말하는 쪽이 낫다.
    */
    return (
      <div className="flex flex-col items-end gap-2">
        <Badge variant="outline">상태 확인 필요</Badge>
        <p className="max-w-xs text-right text-xs text-destructive">
          멈춤 스위치 상태를 읽지 못했습니다. 새로고침해서 다시 확인해 주세요.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <Badge variant={paused ? "destructive" : "secondary"}>{paused ? "AI 멈춤" : "AI 켜짐"}</Badge>
      <form action={setAiPausedAction}>
        <input type="hidden" name="paused" value={paused ? "0" : "1"} />
        <ConfirmSubmitButton
          variant={paused ? "default" : "destructive"}
          confirmMessage={paused
            ? "AI 사용을 다시 켭니다. 회원이 바로 쓸 수 있게 됩니다."
            : "모든 회원(관리자 포함)의 AI 사용을 멈춥니다. 이미 제출돼 도는 그림은 끝까지 돌 수 있습니다. 멈출까요?"}
        >
          {paused ? "AI 다시 켜기" : "AI 전체 멈춤"}
        </ConfirmSubmitButton>
      </form>
      <p className="max-w-xs text-right text-xs text-muted-foreground">
        멈추면 새 요청은 모두 거절되고, 카드뉴스는 다음 장을 보내지 않습니다. 이미 제출돼 도는 그림은 끝까지 돌 수 있습니다.
      </p>
    </div>
  );
}

function Numbers({ report, usdKrw }: { report: AiCostReport; usdKrw: number }) {
  const money = (usd: number) => `${formatKrw(usd, usdKrw)} (${formatUsd(usd)})`;
  return (
    <>
      <dl className="grid gap-3 sm:grid-cols-3">
        {[["오늘", report.todayUsd], ["이번 달", report.monthUsd], [`최근 ${report.days}일`, report.windowUsd]].map(([label, usd]) => (
          <div key={String(label)} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{money(Number(usd))}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 xl:grid-cols-2">
        <SliceTable title={`공급자별 (최근 ${report.days}일)`} rows={report.byProvider} label={aiProviderLabel} money={money} />
        <SliceTable title={`작업별 (최근 ${report.days}일)`} rows={report.byOperation} label={aiOperationLabel} money={money} />
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">일별 (최근 {report.days}일)</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">날짜</th><th className="py-1 pr-3 font-medium">비용</th><th className="py-1 font-medium">호출</th></tr></thead>
          <tbody>
            {[...report.daily].reverse().map((day) => (
              <tr key={day.day} className="border-t"><td className="py-1 pr-3">{day.day}</td><td className="py-1 pr-3">{money(day.usd)}</td><td className="py-1">{day.calls.toLocaleString("ko-KR")}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function SliceTable({ title, rows, label, money }: { title: string; rows: AiCostSlice[]; label: (key: string) => string; money: (usd: number) => string }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {rows.length ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3 font-medium">구분</th><th className="py-1 pr-3 font-medium">비용</th><th className="py-1 pr-3 font-medium">호출</th><th className="py-1 font-medium">그림</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t">
                <td className="py-1 pr-3">{label(row.key)}</td>
                <td className="py-1 pr-3">{money(row.usd)}</td>
                <td className="py-1 pr-3">{row.calls.toLocaleString("ko-KR")}</td>
                <td className="py-1">{row.images.toLocaleString("ko-KR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm text-muted-foreground">기록이 없습니다.</p>}
    </div>
  );
}
