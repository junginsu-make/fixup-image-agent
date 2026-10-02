"use client";
import { useAccountSummary } from "./credit-policy-provider";
export function CreditUsed({ initial }: { initial: number | null }) {
  const account = useAccountSummary();
  const used = account ? account.usage?.pricingPolicy === "image-v2" ? account.usage.used : null : initial;
  if (used === null) return null;
  return <> 이번 달 사용 <strong className="text-foreground">{used.toLocaleString("ko-KR")}크레딧</strong>{account?.error ? " (마지막 확인값)" : ""}.</>;
}
