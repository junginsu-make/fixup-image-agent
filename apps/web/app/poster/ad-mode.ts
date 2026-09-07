import { planMasters } from "../../lib/ad/master-plan";
import type { AdMaster } from "../../lib/ad/specs";

/**
 * 만들기 화면의 광고 모드 규칙.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-c
 *
 * **§4.4 의 「생성 전에 막는다」가 여기서 배선된다.** 1~2단계는 파생이 생성보다
 * 뒤에 와서, 파생이 실패해도 이미 만든 결과물은 멀쩡했다. 3단계는 순서가
 * 뒤집힌다 — 생성이 **먼저**라 파생 실패가 곧 **이미 과금된 생성이
 * 쓸모없어짐**이다.
 *
 * 이 저장소는 같은 판단을 이미 한다 — 「만들 수 없는 조합은 제출조차 하지
 * 않는다」(`lib/__tests__/poster-flow.test.ts`).
 *
 * **`server-only` 를 안 붙인다.** 화면과 시험 양쪽에서 읽는다.
 */

export interface AdSubmitPlan {
  /** 만들 마스터. 길이가 「만들 그림 N장」의 N 이다. */
  masters: AdMaster[];
  /** 제출해도 되는가. */
  ready: boolean;
  /** 왜 안 되는가. 화면이 그대로 적는다. */
  reason?: string;
}

export function adSubmitPlan(specIds: string[]): AdSubmitPlan {
  if (specIds.length === 0) {
    return { masters: [], ready: false, reason: "규격을 하나 이상 고르세요." };
  }

  const { masters, blocked } = planMasters(specIds);

  /**
   * **하나라도 막혀 있으면 전부 막는다.**
   *
   * 되는 것만 만들어 주면 사용자는 **돈을 쓰고 나서야** 「비즈보드는 안 나왔네」를
   * 안다. 그때는 되돌릴 수 없다. 고르는 자리에서 말하면 빼고 다시 누르면 된다.
   */
  if (blocked.length > 0) {
    const first = blocked[0]!;
    const rest = blocked.length > 1 ? ` 외 ${blocked.length - 1}개` : "";
    return { masters: [], ready: false, reason: `${first.specId}${rest}: ${first.reason}` };
  }

  return { masters, ready: true };
}
