import type { CharacterKind } from "./pdp.character";

/**
 * 「내 캐릭터」(Image 1) + 「참고할 그림」(Image 2) 두 장일 때의 지시.
 *
 * 이미지 모델은 그림을 **이름표 없이** 받는다. 어느 쪽을 지키고 어느 쪽을
 * 따를지 적지 않으면 모델이 짐작한다(2026-10-06 설계).
 *
 * **몸 비율만은 Image 2 가 이긴다**(사용자 결정 2026-10-06 — 레퍼런스는 화풍과
 * 체형까지). 「Image 1 을 지켜라」만 적으면 비율도 지킬 대상으로 읽혀, 같은
 * 그림을 넣어도 어떤 때는 길쭉하고 어떤 때는 짧게 나온다.
 *
 * 내 캐릭터만 있을 때는 여기를 안 쓴다 — 「이 캐릭터 뽑아내기」와 같은 일이고
 * 그 문구는 2026-09-08 실측으로 다듬어져 있다(`referenceDirective`).
 */

export const OWN_WITH_EXTRACT_MESSAGE =
  "내 캐릭터를 넣었을 때는 참고할 그림을 「레퍼런스 스타일」로만 쓸 수 있습니다.";

export function ownCharacterWithStyleDirective(kind: CharacterKind): string {
  const noun = kind === "object" ? "object" : "character";
  return (
    ` Image 1 is the user's OWN ${noun}. Keep who it is: the same face or head shape, the colours` +
    ` that belong to the ${noun} itself (hair, skin, fur, clothing, markings), the same outfit, and` +
    " every accessory it is wearing — check each small item one at a time against Image 1." +
    ` Image 2 is a STYLE reference. Redraw the ${noun} from Image 1 in the rendering style of Image 2` +
    " — its line quality, shading, colour treatment and overall finish — and with the body" +
    " proportions of Image 2: the same head-to-body ratio and overall figure shape." +
    " Body proportions are the one exception to keeping Image 1: take them from Image 2." +
    ` Do not copy the ${noun} in Image 2 — its face, outfit, markings and props are not yours to reuse.` +
    " Remove the backgrounds of both images; place the subject alone on a plain neutral background."
  );
}
