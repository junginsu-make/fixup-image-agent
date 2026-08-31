import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";
import { deletePdpDraft, getPdpDraft, savePdpDraft } from "../pdp-drafts";
import { replaceBlueprintState } from "../text-plan-state";

const draftId = "evidence-round-trip";

function section(): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "첫 장면",
    goal: "관심",
    headline: "수강생 42명",
    headline_en: "42 students",
    subheadline: "",
    subheadline_en: "",
    bullets: [],
    bullets_en: [],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "밝은 교실",
    prompt_en: "a bright classroom",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    evidenceVersion: 1,
    evidence: [
      {
        target: { slot: "headline" },
        value: "수강생 42명",
        kind: "sample",
        note: "실제 수강생 수",
        acknowledgedAt: "2026-07-29T01:00:00.000Z",
      },
    ],
  };
}

afterEach(async () => {
  await deletePdpDraft(draftId);
});

describe("글기반 초안", () => {
  it("초안을 저장했다 불러와도 근거가 남는다", async () => {
    const saved = await savePdpDraft({
      id: draftId,
      appState: "editor",
      preparedImage: null,
      modelImage: null,
      modelImageUsage: null,
      result: {
        originalImage: "AAAA",
        blueprint: { executiveSummary: "", scorecard: [], blueprintList: [], sections: [section()] },
      },
      additionalInfo: "",
      desiredTone: "",
      aspectRatio: "9:16",
      notice: "",
      editorState: null,
    });
    const restored = await getPdpDraft(saved.id);

    expect(restored?.result?.blueprint.sections[0]?.evidenceVersion).toBe(1);
    expect(restored?.result?.blueprint.sections[0]?.evidence).toEqual(section().evidence);
  });

  // 재생성은 이전 구성안의 근거·확인 상태를 하나도 물려받으면 안 된다.
  // 그것을 코드로 보장하는 방법은 **이전 상태를 볼 수 없게 만드는 것**이다.
  // 그래서 replaceBlueprintState 는 새 응답 하나만 받는다.
  //
  // 이 테스트는 "두 자리 모두 새 응답 그 자체"임을 참조 동일성으로 확인한다.
  // 나중에 누가 `{ ...previous, ...next }` 처럼 섞으면 여기서 깨진다.
  // (화면 수준의 보장 — handlePlan 이 이 함수를 새 응답으로 부른다 — 은
  //  렌더링 테스트가 없어 검증하지 못한다. 알려진 공백이다.)
  it("재생성 교체는 새 응답만 받아서, 이전 상태가 섞일 수 없다", () => {
    const nextSection = {
      ...section(),
      headline: "새 구성안",
      evidence: [{ target: { slot: "headline" } as const, value: "새 구성안", kind: "rhetoric" as const }],
    };
    const next = { executiveSummary: "", scorecard: [], blueprintList: [], sections: [nextSection] };

    const replaced = replaceBlueprintState(next);

    // 복사·병합 없이 그대로 넘긴다. 섞였다면 참조가 달라진다.
    expect(replaced.blueprint).toBe(next);
    expect(replaced.originalBlueprint).toBe(next);
    // 이전 상태를 받을 자리 자체가 없다.
    expect(replaceBlueprintState.length).toBe(1);
  });
});
