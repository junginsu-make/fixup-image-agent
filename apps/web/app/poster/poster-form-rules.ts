import { MATCH_SOURCE } from "@fixup/sns-core";
import type { AdMaster } from "../../lib/ad/specs";

/**
 * 만들기 화면의 판단들.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3-c·3-d
 *
 * **컴포넌트 안에 두면 시험이 못 간다.** 이 저장소에는 jsdom 이 없고
 * `package.json` 을 건드리면 격리 계약이 깨진다(§4.1). 초판은 이 판단들이 전부
 * `new-client.tsx` 안에 있었고, 그래서 **뮤테이션 넷이 전부 통과했다** —
 * 계약 5 삭제 · 과금 전 차단 삭제 · 마스터 비율 뒤바꿈 · N장을 1장으로.
 *
 * **`server-only` 를 안 붙인다.** 화면과 시험 양쪽에서 읽는다.
 */

export type PosterSection = "mode-toggle" | "ratio" | "ad-specs";

/**
 * 규격 칸에 무엇을 그리는가.
 *
 * **스위치가 꺼져 있으면 예전 그대로다** — 비율 하나뿐이고 토글도 규격 목록도
 * 없다(계약 5). 광고와 무관한 포스터 사용자가 이 화면의 대부분이다.
 */
export function posterSpecSections(
  input: { adEnabled: boolean; adMode: boolean },
): PosterSection[] {
  if (!input.adEnabled) return ["ratio"];
  return input.adMode ? ["mode-toggle", "ad-specs"] : ["mode-toggle", "ratio"];
}

/**
 * 어떤 비율로 재는가.
 *
 * **가드가 보는 값과 본문에 싣는 값이 같아야 한다.** 초판은 가드를 화면 상태
 * (`"2:3"`)로 돌리고 본문에는 `match-source` 를 실었다. `match-source` 는
 * `pixelOnly` 라 `gpt-image-2` 로만 되는데, 화면은 `"2:3"` 로 재서 nano 계열도
 * 통과시켰다 — **모델 넷 중 셋에서 광고 모드가 죽어 있었고**, 사용자는 광고와
 * 아무 상관 없어 보이는 「첨부한 비율을 그대로 쓰려면…」만 봤다.
 */
export function effectiveRatio(adMode: boolean, ratio: string): string {
  return adMode ? MATCH_SOURCE : ratio;
}

/**
 * 프로젝트를 몇 개 만드는가. **비용에 이 수를 곱해야 한다.**
 *
 * 광고 모드의 한 번 클릭은 마스터마다 프로젝트를 만든다(설계 3-0). 안 곱하면
 * 「만들 그림 2장」 바로 아래에서 한 장 값을 보여 주게 된다 — §9 원칙 2 가
 * 「10배 과금을 걱정하지 않게 하려고」 넣은 자리에서 **실제보다 낮은 금액**을
 * 보여 주는 셈이다.
 *
 * 아직 만들 것이 없어도 1 을 준다 — 0 을 곱해 「무료」로 보이면 안 된다.
 */
export function projectCount(adMode: boolean, masterCount: number): number {
  return adMode ? Math.max(1, masterCount) : 1;
}

/**
 * 만들기를 누를 수 있는가.
 *
 * **§4.4 의 「생성 전에 막는다」가 여기서 버튼에 닿는다.** `adSubmitPlan` 이
 * `ready: false` 를 돌려주는 것만으로는 아무것도 안 막힌다.
 */
export function canCreatePoster(input: {
  styleCount: number;
  instruction: string;
  estimateRejected: boolean;
  overReferenceLimit: boolean;
  adMode: boolean;
  adReady: boolean;
}): boolean {
  if (input.styleCount <= 0) return false;
  if (input.instruction.trim().length === 0) return false;
  if (input.estimateRejected || input.overReferenceLimit) return false;
  return !input.adMode || input.adReady;
}

/**
 * 광고 모드가 보낼 요청 본문들.
 *
 * **마스터마다 하나씩이다**(설계 3-0). 한 프로젝트에 둘을 넣으면 저장 경로가
 * 겹쳐 두 번째가 첫 번째를 덮고, `poster_images_one_selected` 때문에 둘 다 고를
 * 수도 없다.
 *
 * 제목에 크기를 붙인다 — 안 그러면 라이브러리에서 어느 것이 어느 규격인지
 * 구분할 수 없다.
 */
export function adProjectBodies<T extends object>(
  base: T,
  masters: AdMaster[],
  title: string,
): Array<T & { ratio: string; adMasterId: string; title: string }> {
  const name = title.trim() || "이름 없는 이미지";
  return masters.map((master) => ({
    ...base,
    ratio: MATCH_SOURCE,
    adMasterId: master.id,
    title: `${name} (${master.width}×${master.height})`,
  }));
}
