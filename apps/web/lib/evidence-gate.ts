import { collectUnverified, findUncoveredFactTargets, scanBannedClaims } from "@fixup/pdp-core";
import type { LandingPageBlueprint, SectionBlueprint } from "@fixup/pdp-core";

function rejection(message: string): Response {
  return Response.json(
    { ok: false, code: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

/** 미확인이 남아 있으면 거절 응답을 돌려준다. 통과하면 null. */
export function rejectIfUnverified(sections: SectionBlueprint[]): Response | null {
  // 근거 배열이 비었는지로 판정하면, 숫자가 하나도 없는 카피나 사용자가 방금 추가한
  // 빈 섹션까지 막힌다. 실제로 막아야 하는 것은 '사실을 말하는 자리인데 근거가 없는' 상태다.
  const uncovered = sections.flatMap((section) => findUncoveredFactTargets(section));
  if (uncovered.length > 0) {
    return rejection("근거 없이 수치를 말하는 문장이 있습니다. 구성안을 다시 확인해 주세요.");
  }

  const blueprint: LandingPageBlueprint = {
    executiveSummary: "",
    scorecard: [],
    blueprintList: [],
    sections,
  };
  if (collectUnverified(blueprint).length > 0) {
    return rejection("확인하지 않은 예시 또는 질문이 남아 있습니다.");
  }

  if (sections.some((section) => scanBannedClaims(section.prompt_en).length > 0)) {
    return rejection("이미지 문구에 사용할 수 없는 주장이 포함되어 있습니다.");
  }

  return null;
}
