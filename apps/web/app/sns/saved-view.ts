import type { SnsFlowState } from "../api/sns/flow-service";

/**
 * 결과 화면에서 원고로 돌아와도 저장된 그림으로 다시 갈 수 있다.
 *
 * **그림 주소가 있다고 결과가 아니다.** 「원본 그대로」·「엔딩 이미지」 카드는
 * 기획 때 첨부 주소를 그대로 받는다(`lib/sns/actual-flow.ts`). 그것까지 세면
 * 한 장도 안 만든 작업에서 05 가 열려 빈 결과판이 나온다(2026-09-29 독립 리뷰).
 * 단계만 봐서도 안 된다 — 원고를 고치면 `copy` 로 돌아간다(`updateFlowCopy`).
 */
export function canViewSnsResult(flow?: SnsFlowState): boolean {
  if (!flow) return false;
  if (flow.stage === "result" || flow.generation) return true;
  return flow.cards.some((card) => card.kind === "generated" && Boolean(card.assetPath || card.assetUrl));
}

export function restoredSnsView(flow: SnsFlowState | undefined, requested: string | null): "copy" | "result" {
  if (requested === "copy") return "copy";
  if (requested === "result" && canViewSnsResult(flow)) return "result";
  return flow?.stage ?? "copy";
}
