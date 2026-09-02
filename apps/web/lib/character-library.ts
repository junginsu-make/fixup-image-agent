import { CHARACTER_ANGLES } from "@fixup/pdp-core";

/**
 * 캐릭터를 라이브러리(참고 이미지)에 넣기 위한 이름과 순서.
 *
 * 캐릭터는 일관성 때문에 정면·좌측·우측·뒷모습 네 장으로 만든다. 그 네 장이
 * 그대로 라이브러리에 들어가야 카드뉴스·포스터·상세페이지가 전부 쓸 수 있다.
 * 한 장만 넣으면 옆모습이 필요한 장면에서 다시 만들어야 하고, 그러면 같은
 * 인물로 안 보인다.
 */

const LABELS = new Map(CHARACTER_ANGLES.map((angle) => [angle.id as string, angle.label]));
const ORDER = new Map(CHARACTER_ANGLES.map((angle, index) => [angle.id as string, index]));

export interface CharacterViewInput {
  angle: string;
  base64: string;
  mimeType: string;
}

export interface CharacterReferenceEntry extends CharacterViewInput {
  title: string;
}

/** 라이브러리에는 온갖 그림이 섞인다. 누구의 어느 각도인지 제목에 다 적는다. */
export function characterReferenceTitle(name: string, angle: string): string {
  return `${name} (캐릭터) · ${LABELS.get(angle) ?? angle}`;
}

/** 정면이 맨 앞이다 — 목록에서 대표로 보이는 것이 뒷모습이면 못 알아본다. */
export function characterReferenceEntries(
  name: string,
  views: CharacterViewInput[],
): CharacterReferenceEntry[] {
  return [...views]
    .sort((left, right) => (ORDER.get(left.angle) ?? 99) - (ORDER.get(right.angle) ?? 99))
    .map((view) => ({ ...view, title: characterReferenceTitle(name, view.angle) }));
}
