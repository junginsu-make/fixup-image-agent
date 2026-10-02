"use client";
import { usePathname } from "next/navigation";
import { Button } from "@fixup/ui";
import { useAccountSummary } from "./credit-policy-provider";
import { CreditInquiry } from "./credit-inquiry";

export function CreditShortageNotice({ accountPage = false }: { accountPage?: boolean }) {
  const account = useAccountSummary();
  const pathname = usePathname();
  if (!account || account.usage?.unlimited || (!accountPage && pathname === "/settings")) return null;
  const { usage, shortage, error } = account;
  if (!accountPage && (!shortage || !usage || error)) return null;
  const empty = usage?.remaining === 0;
  return <section aria-label="크레딧 구매 및 구독 문의" className="space-y-3 rounded-xl border bg-card p-4">
    {shortage && !error ? <p role="status" className="text-sm">{shortage.code === "credits_required"
      ? empty ? "사용 가능한 크레딧이 없습니다. 크레딧 구매 또는 월 구독을 문의해 주세요." : "크레딧을 다시 확인했습니다. 필요한 작업을 다시 선택해 주세요."
      : `요청한 작업은 크레딧 부족으로 시작되지 않았습니다. 현재 사용 가능 ${usage?.remaining ?? "확인 중"}크레딧입니다. 지급 후에는 잔액을 확인하고 다시 시도해 주세요.`}</p>
      : empty && !error ? <p className="text-sm">사용 가능한 크레딧이 없습니다. 크레딧 구매 또는 월 구독을 문의해 주세요.</p> : null}
    {empty && !!usage?.reserved && <p className="text-sm text-muted-foreground">처리 중인 {usage.reserved}크레딧이 있습니다. 작업이 끝난 뒤 사용 가능한 잔액을 확인해 주세요.</p>}
    <CreditInquiry />
    {shortage && <Button type="button" size="sm" variant="ghost" onClick={account.dismissShortage}>부족 안내 닫기</Button>}
  </section>;
}
