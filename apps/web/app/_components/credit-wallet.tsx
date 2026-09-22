import { workCreditExamples } from "@fixup/shared";
import type { UsageSummary } from "../../lib/membership/types";

const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "없음";
export function CreditWallet({ usage }: { usage: UsageSummary }) {
  return <section className="space-y-4 rounded-xl border bg-card p-5" aria-label="크레딧 잔액">
    <h2 className="text-xl font-bold">내 크레딧</h2>
    {usage.unlimited ? <p className="text-base"><strong className="text-4xl">무제한</strong> 최고 관리자 계정입니다</p> : <p className="text-base"><strong className="text-4xl tabular-nums">{usage.remaining.toLocaleString()}</strong> 크레딧 사용 가능</p>}
    <p className="text-base text-muted-foreground">일반 이미지·카드 1장 = 1크레딧 · 인쇄용 600만 픽셀 이상 = 2크레딧. 기획·분석은 무료입니다.</p>
    {!usage.unlimited && <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {([["구독", usage.subscription], ["구매", usage.purchased], ["추가 지급", usage.bonus]] as const).map(([label, slice]) => <div key={label} className="rounded-lg bg-muted p-3"><dt>{label}</dt><dd className="font-semibold">{slice?.units ?? 0}크레딧</dd><dd className="text-xs text-muted-foreground">가장 가까운 만료: {date(slice?.expiresAt)}</dd></div>)}
    </dl>}
    <p className="text-base">처리 중 <strong className="tabular-nums">{usage.reserved}</strong>크레딧 · 이번 달 사용 <strong className="tabular-nums">{usage.used}</strong>크레딧</p>
    {usage.reserved > 0 && <p className="text-sm text-muted-foreground">처리 중인 금액은 사용 가능 잔액에서 제외됩니다. 중지·통신 오류로 결과 확인이 필요한 작업은 확인 후 확정하거나 돌려드립니다.</p>}
    {!usage.unlimited && <details><summary className="cursor-pointer text-sm font-medium">이 잔액으로 얼마나 만들 수 있나요?</summary><div className="mt-2 space-y-1 text-sm">{workCreditExamples(usage.remaining).map(example => <p key={example.id}>{example.label}: {example.count}회 ({example.images}크레딧/회)</p>)}<p className="text-xs text-muted-foreground">각 작업만 만들었을 때의 예시입니다. 구독은 매월 말 만료하며 이월되지 않습니다. 구매분은 지급일로부터 3개월간 사용할 수 있습니다.</p></div></details>}
  </section>;
}
