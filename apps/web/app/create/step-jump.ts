/**
 * 단계 막대에서 **어디로 갈 수 있는가.**
 *
 * 이미지 만들기가 같은 판단을 `poster/steps.ts` 의 `reachableBeforeCreate` 로
 * 이미 하고 있다. 상세페이지에는 그 판단이 아예 없어서 **막대를 눌러도 아무
 * 일이 안 일어났다** — 화면마다 다른 곳은 되고 다른 곳은 안 됐다.
 *
 * 화면 안에서 갈래를 타면 값으로 못 잰다. 이 저장소가 여러 번 데인 자리다.
 */

export type CreateStepId = "upload" | "analyze" | "sections" | "edit";

export interface CreateProgress {
  /** 구성안이 만들어졌는가. 없으면 2단계 뒤로는 갈 데가 없다. */
  hasResult: boolean;
}

/**
 * 구성안이 없으면 1단계에만 머문다.
 *
 * 「보여 주는 것」과 「거기로 보내는 것」은 다른 문제다 — 막대에는 네 단계를
 * 다 보여 주되, 아직 없는 화면으로는 안 보낸다.
 */
export function canReachStep(id: string, progress: CreateProgress): boolean {
  if (id === "upload") return true;
  return progress.hasResult;
}
