import type { LandingPageBlueprint } from "@fixup/pdp-core";

/** 재생성 응답은 이전 구성안과 섞지 않고 원본·편집본을 함께 교체한다. */
export function replaceBlueprintState(next: LandingPageBlueprint) {
  return { originalBlueprint: next, blueprint: next };
}
