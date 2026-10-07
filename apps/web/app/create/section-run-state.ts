import type { ItemState } from "../_components/item-status";

/**
 * **섹션마다 같은 말로 상태를 보인다**(2026-10-08 사용자).
 *
 * 일괄 생성은 대상 섹션을 처음에 한꺼번에 잠근다(`generatingKeys`). 요청은
 * 묶음마다 차례로 가는데, 잠금만 보면 아직 안 보낸 섹션까지 도는 것처럼
 * 보였다. 지금 보낸 묶음(`inFlightKeys`)만 「만드는 중」, 아직 안 보낸 것은 「차례 대기」다.
 *
 * **돌아온 묶음(`settledKeys`)은 대기로 돌아가지 않는다.** 잠금은 일괄이 다 끝나야
 * 풀린다. 일괄은 그림 없는 섹션만 보내므로, 돌아왔는데 그림이 없으면 실패다.
 *
 * **보이는 것만 정한다.** 단추를 막는 기준은 여전히 `generatingKeys` 다.
 */
export interface SectionRun {
  generatingKeys: readonly string[];
  inFlightKeys: readonly string[];
  settledKeys: readonly string[];
}

export function sectionRunState(key: string, hasImage: boolean, run: SectionRun): ItemState {
  // 잠금이 풀린 섹션은 돌지 않는다 — 단추와 말이 어긋나지 않게 잠금을 먼저 본다.
  if (!run.generatingKeys.includes(key)) return hasImage ? "done" : "idle";
  if (run.inFlightKeys.includes(key)) return "working";
  if (run.settledKeys.includes(key)) return hasImage ? "done" : "failed";
  return "queued";
}
