import type { SectionBlueprint } from "@fixup/pdp-core";
import { buildSectionKeys } from "./pdp-drafts";

/**
 * 저장해 둔 섹션 키를 되살린다.
 *
 * ── 왜 이 판단이 중요한가 ─────────────────────────────────────
 *
 * 레이어와 섹션별 설정은 순서가 아니라 **고유 키**로 저장한다. 순서로 저장하면
 * 섹션을 옮겼을 때 남의 레이어가 딸려온다.
 *
 * 그런데 되살린 키 목록이 **지금 그리는 섹션과 길이가 다르면** 짝이 어긋나고,
 * 결국 같은 사고가 난다 — 레이어가 남의 섹션에 붙는다.
 *
 * ── 무엇이 틀렸었나 ──────────────────────────────────────────
 *
 * 전에는 「초안의 키 개수 === **초안의** 섹션 개수」로 확인했다. 그런데 화면이
 * 실제로 그리는 것은 `initialResult` 의 섹션이다. 그 둘이 다르면 **짝이 어긋난
 * 채로 통과한다.** 비교 대상을 그리는 섹션으로 바꾼다.
 *
 * 같은 식이 화면에 두 번 적혀 있기도 했다. 한 곳만 고치는 날이 오므로 함수로 뺀다.
 */
export function restoreSectionKeys(input: {
  draftKeys: string[] | undefined;
  draftSections: SectionBlueprint[] | undefined;
  renderedSections: SectionBlueprint[];
}): string[] {
  const { draftKeys, renderedSections } = input;

  // 지금 그리는 섹션과 개수가 맞을 때만 저장된 키를 믿는다.
  if (draftKeys?.length && draftKeys.length === renderedSections.length) {
    return draftKeys;
  }

  // 새로 지을 때도 **그리는 섹션**으로 짓는다. 초안 것으로 지으면 또 어긋난다.
  return buildSectionKeys(renderedSections);
}
