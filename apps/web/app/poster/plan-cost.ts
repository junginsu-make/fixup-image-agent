import { creditUnits, llmCostUsd, withJosa, type AttachmentRole } from "@fixup/shared";
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
  /**
   * 「따라 만들기」로 고른 그림 수. 기획이 **한 장씩 비전으로** 읽는다
   * (`plan/route.ts` 의 `readReferenceGrammar`).
   */
  styleCount: number;
  /**
   * 지킬 **사람** 사진 수 (`readPeople`).
   *
   * **제품 보존은 세지 않는다.** 붙인 그림 전부를 세면 화면이 실제보다 비싸게
   * 말한다 — 라우트는 `personIds` 에 든 것만 읽고, 제품 보존 사진은 아무도
   * 안 읽는다(2026-09-16 리뷰에서 걸렸다. 따라 만들기 1 + 제품 보존 1 이면
   * 화면 $0.034, 실제 $0.024 로 42% 과대였다).
   */
  personCount: number;
  /** 안 넘기면 지금까지대로 다듬는다. */
  promptMode?: PromptMode;
  /** 광고 모드는 규격마다 작업이 따로 생기고 기획도 그만큼 돈다. */
  projects?: number;
}

/**
 * 붙인 그림의 **역할**에서 셈할 칸 둘을 뽑는다.
 *
 * **이 판단이 `.tsx` 안에 있으면 시험이 못 간다.** 실제로 그래서 「제품 보존을
 * 세느냐」가 값 시험을 다 통과한 채로 틀려 있었다(2026-09-16). 화면이 무엇을
 * 세는지가 이 함수 하나로 모이고, 그 하나를 값으로 잰다.
 *
 * 라우트가 읽는 것과 짝이 맞아야 한다.
 *   · `style`                    → `readReferenceGrammar` (레이아웃 문법)
 *   · `preserve_person(_restyled)` → `readPeople` (인물 묘사)
 *   · 나머지(`preserve_product`·`place_as_is`) → **아무도 안 읽는다**
 *
 * **역할을 `AttachmentRole` 로 받는다.** `string` 으로 두면 `attachment-role.ts`
 * 에서 이름을 바꿨을 때 tsc 도 시험도 조용하고, 값이 0 으로 떨어져 화면이
 * 실제보다 **싸게** 말한다. 이번에 고친 버그와 같은 결의 구멍이다.
 */
export function planCostCounts(roles: readonly (AttachmentRole | "none")[]): {
  styleCount: number;
  personCount: number;
} {
  return {
    styleCount: roles.filter((role) => role === "style").length,
    personCount: roles.filter(
      (role) => role === "preserve_person" || role === "preserve_person_restyled",
    ).length,
  };
}

/**
 * 몇 장을 읽나. **읽기에 실패한 것은 라우트가 안 센다**(`grammar.issues`).
 * 화면은 그것을 미리 알 수 없어 여기 값은 **가장 비싼 경우**다.
 */
function visionReads(input: PlanCostInput): number {
  return Math.max(0, input.styleCount) + Math.max(0, input.personCount);
}

function projectCount(input: PlanCostInput): number {
  return Math.max(1, input.projects ?? 1);
}

/**
 * 기획에 드는 달러.
 *
 * **식을 다시 적지 않는다.** 라우트가 쓰는 `llmCostUsd` 를 그대로 부른다.
 * 여기서 손으로 다시 세면 화면이 말하는 값과 실제로 깎이는 값이 갈린다.
 */
export function planCostUsd(input: PlanCostInput): number {
  if (input.promptMode === "verbatim") return 0;

  const projects = projectCount(input);
  return llmCostUsd({ planCalls: projects, visionReads: visionReads(input) * projects });
}

/**
 * 한도에서 실제로 빠지는 **장** 수.
 *
 * 달러가 아니라 장이 빠진다(`plan/route.ts` 가 `creditUnits` 로 바꿔 예약한다).
 * $0.014 는 올림해서 **1장**(=$0.05)이라 3.5배 차이가 난다. 달러만 적으면
 * 「그대로 생성이 얼마나 아끼나」를 견주라고 넣은 자리에서 실제보다 적게 말한다.
 *
 * **프로젝트마다 따로 올림한다.** 라우트가 프로젝트마다 한 번씩 예약하므로
 * 합쳐서 올림하면 모자란다.
 */
export function planCostUnits(input: PlanCostInput): number {
  if (input.promptMode === "verbatim") return 0;

  const once = llmCostUsd({ planCalls: 1, visionReads: visionReads(input) });
  return creditUnits(once) * projectCount(input);
}

/**
 * 화면에 붙일 한 줄.
 *
 * **숫자로 말한다.** 「추가로 듭니다」만으로는 두 갈래를 견줄 수 없다. 얼마가
 * 빠지는지 알아야 「그대로 생성」을 고를 값어치가 있는지 판단한다.
 *
 * **단위는 장이다. 달러를 안 적는다**(2026-09-17 사용자 결정). 회원이 쓰는
 * 단위는 장이고 사용량도 상단에 「N/M장」으로 나온다 — 한 화면에 단위가 둘이면
 * 무엇과 견주는지가 흐려진다. 달러는 관리자 화면(원가 장부)이 갖는다.
 */
export function planCostNote(input: PlanCostInput): string {
  if (input.promptMode === "verbatim") {
    return "기획을 안 돌려서 기획 몫이 안 듭니다.";
  }
  // 「장」은 받침이 있어 「이」다. 앞말이 바뀌어도 안 틀리게 저장소 함수를 쓴다.
  const 장 = `${planCostUnits(input)}장`;
  return `기획에 ${withJosa(장, "이가")} 더 듭니다.`;
}
