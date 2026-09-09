import { creditUnits, llmCostUsd } from "@fixup/shared";
import { finalizeAiUsage } from "../membership/api";
import type { SnsFlowState } from "../../app/api/sns/flow-service";

/**
 * 예약을 마무리하고 열쇠를 지운 흐름을 돌려준다.
 *
 * **폴링만 확정하던 것을 여기로 모은다.** 지금까지 이 셈은 `status` 라우트
 * 안에만 있었고, 그 라우트는 「도는 중인 흐름을 폴링할 때」에만 여기까지 왔다.
 * 그래서 흐름이 그 밖에서 끝나면 예약이 영영 안 풀렸다.
 *
 *   - 사이드바 「중지」는 카드를 failed 로 바꾸고 끝낸다. 그다음 `status`
 *     요청은 「도는 중이 아니다」로 곧장 빠져나간다.
 *   - 그림 칸이 없는 세트는 제출 안에서 전부 합성되어 바로 끝난다. 화면은
 *     도는 중이 아니라고 보고 `status` 를 한 번도 안 부른다.
 *
 * 두 경우 모두 예약 행이 `reserved` 로 남아 만료까지 크레딧을 묶고, 이미 나간
 * fal 값은 장부에 안 실렸다.
 *
 * 열쇠가 없으면 아무것도 안 하고 받은 흐름을 그대로 돌려준다 — 부르는 쪽이
 * 조건을 또 쓰지 않아도 되게 한다.
 */
export async function settleSnsReservation(
  userId: string,
  flow: SnsFlowState,
): Promise<SnsFlowState> {
  const reservationId = flow.generation?.reservationId;
  if (!reservationId) return flow;

  /**
   * **이번에 늘어난 만큼만 받는다.**
   *
   * `flow.costs` 는 쌓이기만 한다. 합계를 그냥 쓰면 다시 만들기를 누를 때마다
   * 옛 값을 또 받는다.
   */
  const total = flow.costs.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
  const spent = Math.max(0, total - (flow.generation?.costBaselineUsd ?? 0));
  /**
   * 이번에 고른 장 중 실제로 나온 것. 옛 카드는 안 센다.
   *
   * **검수에 걸린 장도 나온 장이다.** `review_required` 는 그림이 이미
   * 만들어졌고 fal 값도 다 나간 상태이고, 원고와 글자가 다르다는 것은 이
   * 도구의 정상 결과다. 예전에는 `"done"` 만 세어서, 여섯 장이 모두 검수에
   * 걸리면 `made` 가 0 이 됐다. 그러면 `finalize_generation` 이
   * `consumed_units` 를 0 으로 만들어 이미 나간 비용이 통째로 사라졌다.
   * 표지 한 장이 그대로 놓이는 구성이냐에 따라 과금 여부가 갈리기까지 했다.
   */
  const picked = new Set(flow.generation?.selectedCardIndexes ?? []);
  const made = flow.cards.filter(
    (card) => picked.has(card.index) && (card.status === "done" || card.status === "review_required"),
  ).length;

  try {
    await finalizeAiUsage(
      { userId, requestId: reservationId },
      made > 0,
      creditUnits(spent + llmCostUsd({ planCalls: 1 + made })),
    );
  } catch {
    // 삼킨다. 사용자가 만든 카드를 못 보는 것이 더 나쁘다.
  }

  return {
    ...flow,
    generation: { ...flow.generation!, reservationId: undefined, costBaselineUsd: undefined },
  };
}
