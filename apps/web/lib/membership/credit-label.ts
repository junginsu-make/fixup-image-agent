import type { UsageSummary } from "./types";

/**
 * 잔액 한 줄. **무제한 계정은 숫자를 말하지 않는다** — DB 는 관리자에게 1억
 * 크레딧 한 덩어리를 주는 방식으로 무제한을 만든다(202609220003).
 */
export const creditBalanceLabel = (usage: Pick<UsageSummary, "unlimited" | "remaining">) =>
  usage.unlimited ? "무제한" : `${usage.remaining.toLocaleString("ko-KR")}크레딧 남음`;
