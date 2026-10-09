"use client";
import type { SubscriptionSummary } from "../../lib/membership/account-types";
const dates = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
const statuses = { active: "이용 중", canceled: "해지됨", suspended: "중단됨" };
/*
  배정 = 지급, 매달 자동(2026-10-09 사용자 결정). 구독 크레딧은 배정한 날부터 한 달씩 들어오고,
  켜져 있는 동안 이번 기간이 끝나는 때에 다음 몫이 들어온다. 그래서 「다음 지급」은 이번 기간의 끝이다.
*/
export function SubscriptionCard({ subscription }: { subscription: SubscriptionSummary | null }) {
  return <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="내 구독">
    <h2 className="text-xl font-bold">내 구독</h2>
    {!subscription ? <p>구독 정보를 확인 중입니다.</p> : subscription.state === "unavailable" ? <p role="status">구독 정보를 확인하지 못했습니다. 크레딧 새로고침으로 다시 확인해 주세요.</p> : subscription.state === "none" ? <p>이용 중인 구독이 없습니다.</p> : <>
      <p><strong>{subscription.plan.name}</strong> · {statuses[subscription.status]}</p>
      <p>플랜 기본 제공량: 월 {subscription.plan.monthlyUnits.toLocaleString("ko-KR")}크레딧 · 기본 가격 {subscription.plan.priceKrw.toLocaleString("ko-KR")}원</p>
      {subscription.currentPeriod ? <dl className="grid gap-2 text-sm">
        <div><dt className="text-muted-foreground">이번 기간 (한국시간)</dt><dd>{dates(subscription.currentPeriod.startsAt)} ~ {dates(subscription.currentPeriod.expiresAt)}</dd></div>
        <div><dt className="text-muted-foreground">이번 기간 지급량</dt><dd>{subscription.currentPeriod.grantedUnits.toLocaleString("ko-KR")}크레딧</dd></div>
        {subscription.status === "active" ? <div><dt className="text-muted-foreground">다음 지급</dt><dd>{dates(subscription.currentPeriod.expiresAt)}</dd></div> : null}
      </dl> : <p className="text-sm text-muted-foreground">{subscription.status === "active" ? "구독 크레딧을 준비하고 있습니다. 잠시 뒤 크레딧 새로고침을 눌러 주세요." : "이번 기간에 지급된 구독 크레딧이 없습니다."}</p>}
      {subscription.status !== "active" && <p className="text-sm text-muted-foreground">이미 지급된 크레딧은 잔액과 만료일에 따라 사용할 수 있습니다.</p>}
    </>}
    <p className="text-sm text-muted-foreground">구독 크레딧은 배정한 날부터 한 달씩 들어오고, 그 기간이 끝나면 남은 몫은 사라집니다. 사용 가능한 구독 잔액은 내 크레딧에서 확인할 수 있습니다.</p>
  </section>;
}
