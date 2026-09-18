import { creditUnits, llmCostUsd } from "@fixup/shared";
import { estimatePosterCost } from "@fixup/poster-core";

/**
 * **이번 한 장에 얼마 드나** (설계 §5-2).
 *
 * ── 왜 미리 보여야 하나 ──────────────────────────────────────
 *
 * 채팅은 빠른 대신 **돌이킬 수 없다.** 04 기획 확인 같은 중간 단계가 없어,
 * 엔터가 곧 생성이다. **누르기 전에 아는 것이 누른 뒤에 아는 것보다 낫다.**
 *
 * ── 글값도 함께 센다 ────────────────────────────────────────
 *
 * 포스터 03 이 그림값만 적고 기획값을 빼먹어 2026-09-17 에 고친 일이 있다
 * (`plan-cost.ts`). Easy 는 한 번에 둘 다 도는데 하나만 적으면 실제와 갈린다.
 *
 * ── 단위는 장이다 ───────────────────────────────────────────
 *
 * 설계 §5-2 는 「약 $0.05」로 적었지만, 같은 날 **회원 화면은 장으로 말한다**고
 * 정했다(`plan-cost.ts` 의 주석). 회원이 쓰는 단위가 장이고 사용량도 상단에
 * 「N/M장」으로 나온다 — 한 화면에 단위가 둘이면 무엇과 견주는지가 흐려진다.
 * 달러는 관리자 화면이 갖는다.
 *
 * **화면 밖에서 잰다.** `.tsx` 안에 두면 「얼마가 드는가」를 값으로 못 잰다.
 */

export interface EasyCostInput {
  /** 그림 모델 id. */
  modelId: string;
  /** 붙인 그림 수. 기획이 **한 장씩 비전으로** 읽는다(`readAttachments`). */
  attachmentCount: number;
  /** 화면이 쓰는 기본값. 바꿀 수 없다(설계 §9). */
  ratioId: string;
}

export interface EasyCost {
  /** 한도에서 빠지는 장 수. 셀 수 없으면 `undefined`. */
  units?: number;
  /** 못 세는 까닭. 있으면 화면이 금액을 안 적는다. */
  rejected?: string;
}

/**
 * **가장 비싼 경우로 잡는다.**
 *
 * 읽기에 실패한 것은 라우트가 안 센다. 화면은 그것을 미리 알 수 없으니 전부
 * 읽는다고 보고 잰다 — 적게 잡으면 사용자가 모르는 사이에 한도가 준다.
 */
export function easyCost(input: EasyCostInput): EasyCost {
  const attachments = Math.max(0, input.attachmentCount);

  const image = estimatePosterCost({
    modelId: input.modelId,
    ratioId: input.ratioId,
    // Easy 는 한 줄에 한 장이다(설계 §9).
    variants: 1,
    hasReferences: attachments > 0,
  });
  if (image.rejected) return { rejected: image.rejected };
  if (image.totalUsd === undefined) return { rejected: "값을 셀 수 없습니다." };

  /*
   * **식을 다시 적지 않는다.** 라우트가 쓰는 `llmCostUsd` 를 그대로 부른다.
   * 여기서 손으로 다시 세면 화면이 말하는 값과 실제로 깎이는 값이 갈린다.
   */
  const text = llmCostUsd({ planCalls: 1, visionReads: attachments });

  /*
   * **따로 올림한다.** 라우트가 기획과 그림을 **각각** 예약한다 — 합쳐서
   * 올림하면 실제보다 적게 말한다.
   */
  return { units: creditUnits(text) + creditUnits(image.totalUsd) };
}
