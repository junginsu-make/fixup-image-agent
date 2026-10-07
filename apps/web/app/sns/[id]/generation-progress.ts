import type { SnsFlowCard } from "../../api/sns/flow-service";

/**
 * 그림 만들기 띠의 「N/M장」.
 *
 * **만들 카드(`generated`)만 센다** — 사용자 원본은 처음부터 완료라 넣으면 막대가
 * 처음부터 차 있다. 한 장뿐이면 막대가 채워질 일이 없어 안 준다(2026-10-08).
 */
export function generationProgress(cards: Pick<SnsFlowCard, "kind" | "status">[]): { done: number; total: number } | undefined {
  const mine = cards.filter((card) => card.kind === "generated");
  if (mine.length < 2) return undefined;
  const done = mine.filter((card) => card.status === "done" || card.status === "review_required").length;
  return { done, total: mine.length };
}
