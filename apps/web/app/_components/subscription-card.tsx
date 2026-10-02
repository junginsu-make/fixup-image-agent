"use client";
import type { SubscriptionSummary } from "../../lib/membership/account-types";
const dates = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
const statuses = { active: "이용 중", canceled: "해지됨", suspended: "중단됨" };
export function SubscriptionCard({ subscription }: { subscription: SubscriptionSummary | null }) {
  return <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="내 구독">
    <h2 className="text-xl font-bold">내 구독</h2>
    {!subscription ? <p>구독 정보를 확인 중입니다.</p> : subscription.state === "unavailable" ? <p role="status">구독 정보를 확인하지 못했습니다. 크레딧 새로고침으로 다시 확인해 주세요.</p> : subscription.state === "none" ? <p>이용 중인 구독이 없습니다.</p> : <>
      <p><strong>{subscription.plan.name}</strong> · {statuses[subscription.status]}</p>
      <p>플랜 기본 제공량: 월 {subscription.plan.monthlyUnits.toLocaleString("ko-KR")}크레딧 · 기본 가격 {subscription.plan.priceKrw.toLocaleString("ko-KR")}원</p>
      {subscription.currentPeriod ? <dl className="grid gap-2 text-sm">
        <div><dt className="text-muted-foreground">이번 달 결제 확인</dt><dd>완료 · {subscription.currentPeriod.paidKrw.toLocaleString("ko-KR")}원</dd></div>
        <div><dt className="text-muted-foreground">이번 달 확인된 지급량</dt><dd>{subscription.currentPeriod.grantedUnits.toLocaleString("ko-KR")}크레딧</dd></div>
        <div><dt className="text-muted-foreground">해당 기간 (한국시간)</dt><dd>{dates(subscription.currentPeriod.startsAt)} ~ {dates(subscription.currentPeriod.expiresAt)}</dd></div>
      </dl> : <p className="text-sm text-muted-foreground">{subscription.status === "active" ? "플랜은 배정되어 있습니다. 이번 달 결제 확인 후 구독 크레딧이 지급됩니다." : "이번 달 결제 확인 내역이 없습니다."}</p>}
      {subscription.status !== "active" && <p className="text-sm text-muted-foreground">이미 지급된 크레딧은 잔액과 만료일에 따라 사용할 수 있습니다.</p>}
    </>}
    <p className="text-sm text-muted-foreground">관리자가 결제를 확인한 기간에 크레딧을 지급합니다. 사용 가능한 구독 잔액은 내 크레딧에서 확인할 수 있습니다.</p>
  </section>;
}
