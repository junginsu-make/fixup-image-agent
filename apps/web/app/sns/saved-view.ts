import type { SnsFlowState } from "../api/sns/flow-service";

/** 결과 화면에서 원고로 돌아와도 저장된 그림으로 다시 갈 수 있다. */
export function canViewSnsResult(flow?: SnsFlowState): boolean {
  return Boolean(flow && (flow.stage === "result" || flow.cards.some(card => card.assetPath || card.assetUrl)));
}

export function restoredSnsView(flow: SnsFlowState | undefined, requested: string | null): "copy" | "result" {
  if (requested === "copy") return "copy";
  if (requested === "result" && canViewSnsResult(flow)) return "result";
  return flow?.stage ?? "copy";
}
