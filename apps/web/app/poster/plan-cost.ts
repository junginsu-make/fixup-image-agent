import { LLM_PLAN_USD, LLM_VISION_READ_USD } from "@fixup/shared";
import type { PromptMode } from "./prompt-mode";

/**
 * **기획에 드는 값.**
 *
 * 03 의 「예상 비용」은 그림 값만 적는다. 기획은 따로 돌고 따로 차감되는데
 * (`api/poster/projects/[id]/plan/route.ts` 가 `reserveAiUsage` 를 부른다)
 * 화면이 그 얘기를 한 줄도 안 했다.
 *
 * 「그대로 생성」을 고르면 기획이 **아예 안 돈다.** 안 드는 값을 안 든다고
 * 말해야 두 갈래를 견줄 수 있다(설계 §9 의 열어 둔 물음).
 *
 * **화면 밖에서 잰다.** `.tsx` 안에 두면 「얼마가 빠지는가」를 값으로 못 잰다.
 */

export interface PlanCostInput {
  /** 첨부한 그림 수. 기획이 한 장씩 비전으로 읽는다. */
  referenceCount: number;
  /** 안 넘기면 지금까지대로 다듬는다. */
  promptMode?: PromptMode;
  /** 광고 모드는 규격마다 작업이 따로 생기고 기획도 그만큼 돈다. */
  projects?: number;
}

/**
 * 기획 한 번에 드는 달러.
 *
 * 값의 근거는 `plan/route.ts` 가 예약할 때 쓰는 식과 같다 —
 * `llmCostUsd({ planCalls: 1, visionReads })`. 여기서 다시 세면 화면이 말하는
 * 값과 실제로 깎이는 값이 갈린다.
 */
export function planCostUsd(input: PlanCostInput): number {
  if (input.promptMode === "verbatim") return 0;

  const projects = Math.max(1, input.projects ?? 1);
  const reads = Math.max(0, input.referenceCount);
  const once = LLM_PLAN_USD + reads * LLM_VISION_READ_USD;

  return Number((once * projects).toFixed(4));
}

/**
 * 화면에 붙일 한 줄.
 *
 * **숫자로 말한다.** 「추가로 듭니다」만으로는 두 갈래를 견줄 수 없다 — 얼마가
 * 빠지는지 알아야 「그대로 생성」을 고를 값어치가 있는지 판단한다.
 */
export function planCostNote(input: PlanCostInput): string {
  if (input.promptMode === "verbatim") {
    return "기획을 안 돌려서 기획 값이 안 듭니다.";
  }
  return `기획에 약 $${planCostUsd(input).toFixed(3)}가 더 듭니다.`;
}
