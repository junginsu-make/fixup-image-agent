import type { SnsFlowState } from "../../api/sns/flow-service";

const FINISHED = new Set(["done", "review_required", "failed"]);

/**
 * 그림 만들기 띠의 「N/M장」.
 *
 * **이번 만들기에 고른 만들 카드(`generated`)만 센다**(2026-10-08 리뷰 M1). 전에는 모든
 * 카드를 세어, 여섯 장 중 한 장만 다시 만드는데 「5/6장」이 떴다. 사용자 원본은 처음부터
 * 완료라 넣으면 막대가 처음부터 차 있다. 끝난 만들기는 안 센다 — 다시 누른 직후 응답 전에
 * 옛 6/6 이 뜬다. 실패도 처리한 장으로 센다(상세페이지 띠와 같은 셈). 한 장뿐이면 안 준다.
 */
export function generationProgress(flow: Pick<SnsFlowState, "cards" | "generation"> | undefined): { done: number; total: number } | undefined {
  const run = flow?.generation;
  if (!flow || !run || run.completedAt) return undefined;
  const mine = run.selectedCardIndexes
    .map((index) => flow.cards[index])
    .filter((card) => card?.kind === "generated");
  if (mine.length < 2) return undefined;
  return { done: mine.filter((card) => FINISHED.has(card.status)).length, total: mine.length };
}
