/**
 * 내 크레딧 사용 기록 — 한 줄씩 어떻게 읽히나.
 *
 * **잔액 계산(`credit_wallet_state`)과 같은 규칙이다.** 새 기준(`image-v2`)에서 성공한
 * 작업만 `consumed_units` 만큼 빠진다. 처리 중인 것은 잡아 둔 것이지 빠진 것이 아니고,
 * 실패는 빠지지 않는다. 기록의 합과 「이번 달 사용」이 달라 보이면 기록을 믿을 수 없다.
 *
 * 크레딧 적용(2026-09-22) 전 기록은 **단위가 다르다(장).** 크레딧처럼 보이면 잔액과 안
 * 맞아 보이므로, 따로 표시하고 합계에 안 섞는다.
 */

export interface UsageEventRow {
  id: string;
  operation: string;
  status: string;
  pricing_policy: string;
  requested_units: number;
  consumed_units: number;
  credit_phase: string | null;
  error_code: string | null;
  created_at: string;
  period_start: string;
}

export interface UsageLine {
  tool: string;
  amount: string;
  status: string;
  /** 크레딧 잔액에서 실제로 빠진 양. 옛 기준·처리 중·실패는 0. */
  charged: number;
  legacy: boolean;
  tone: "charged" | "pending" | "free" | "failed" | "legacy";
}

/** 사이드바에서 쓰는 이름과 맞춘다. 회원이 메뉴에서 본 이름으로 찾는다. */
const TOOL: Record<string, string> = {
  pdp_analyze: "상세페이지 · 분석",
  pdp_image: "상세페이지 · 이미지",
  redesign_transcribe: "리디자인 · 읽기",
  redesign_generate: "리디자인 · 생성",
  redesign_edit: "리디자인 · 수정",
  poster_image: "이미지 만들기",
  sns_image: "카드뉴스",
  ad_export: "광고소재",
  reference_analyze: "참고 이미지 분석",
};

const n = (value: number) => Math.max(0, Math.floor(Number(value) || 0));

export function describeUsageEvent(row: UsageEventRow): UsageLine {
  const tool = TOOL[row.operation] ?? row.operation;
  const requested = n(row.requested_units);
  const consumed = n(row.consumed_units);

  if (row.pricing_policy !== "image-v2") {
    const status = row.status === "succeeded" ? "크레딧 적용 전" : row.status === "failed" ? "크레딧 적용 전 · 실패" : "크레딧 적용 전 · 처리 중";
    return { tool, amount: row.status === "succeeded" ? `${consumed}장` : "0", status, charged: 0, legacy: true, tone: "legacy" };
  }
  if (row.status === "reserved") {
    const review = row.credit_phase === "needs_review";
    return {
      tool, amount: requested ? `${requested}크레딧 잡아 둠` : "무료",
      status: review ? "확인 대기 · 운영자가 확인 후 확정하거나 돌려드립니다" : "처리 중",
      charged: 0, legacy: false, tone: "pending",
    };
  }
  if (row.status === "failed") return { tool, amount: "0", status: "실패 · 차감 없음", charged: 0, legacy: false, tone: "failed" };
  if (!requested && !consumed) return { tool, amount: "무료", status: "완료", charged: 0, legacy: false, tone: "free" };
  if (!consumed) return { tool, amount: "0", status: "결과 없음 · 차감 없음", charged: 0, legacy: false, tone: "failed" };
  const refunded = requested - consumed;
  return {
    tool, amount: `-${consumed}크레딧`,
    status: refunded > 0 ? `일부 완료 · ${refunded}크레딧 돌려받음` : "완료",
    charged: consumed, legacy: false, tone: "charged",
  };
}

/** 이번 달 합계 — 잔액의 「이번 달 사용」과 같은 규칙(새 기준·이번 달·성공한 것). */
export function monthlyCreditTotal(rows: readonly UsageEventRow[], periodStart: string): number {
  return rows
    .filter((row) => row.pricing_policy === "image-v2" && row.status === "succeeded" && row.period_start === periodStart)
    .reduce((sum, row) => sum + n(row.consumed_units), 0);
}
