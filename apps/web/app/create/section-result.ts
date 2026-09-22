import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 비동기로 돌아온 결과를 **제 섹션에** 붙인다(A-16).
 *
 * ── 무엇이 위험했나 ──────────────────────────────────────────
 *
 * 화면 안에서 `sectionKeys[itemIndex] === sectionKey` 로 찾았는데, 그
 * `sectionKeys` 는 **생성을 시작할 때의 배열**이다(클로저). 생성이 도는 동안
 * 순서가 바뀌면 인덱스와 키의 짝이 달라져 **엉뚱한 섹션에 이미지가 박힌다.**
 *
 * 지금은 화면이 순서 변경·삭제를 잠가서(`generationLockRef`) 그 창이 안 열린다.
 * 문제는 **잠금이 유일한 방어**라는 것이다 — 잠금을 안 거는 길이 하나 생기면
 * 조용히 되살아나고, 그때 사용자가 보는 것은 「왜 이 섹션에 저 그림이」다.
 *
 * ── 고친 방법 ────────────────────────────────────────────────
 *
 * 함수로 뺀다. 부르는 쪽이 **지금 배열**(ref)을 넘기게 하면, 오래된 배열을
 * 넘기는 것이 눈에 보인다. 그리고 여기서 값으로 잴 수 있다.
 */
export function applyToSectionByKey(
  sections: readonly SectionBlueprint[],
  /** **지금** 키 배열. 섹션과 짝이 맞아야 한다 — 순서 변경은 둘을 함께 옮긴다. */
  keys: readonly string[],
  key: string,
  patch: Partial<SectionBlueprint>,
): SectionBlueprint[] {
  return sections.map((section, index) =>
    keys[index] === key ? { ...section, ...patch } : section,
  );
}
