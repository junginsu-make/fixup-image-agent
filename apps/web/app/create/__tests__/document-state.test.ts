import { describe, expect, it } from "vitest";
import { createPdpDocument, updatePdpDocument, documentToDraft } from "../document-state";
import { createEmptySection } from "../scenario-sections";
import type { PdpDraftInput } from "../pdp-drafts";

function source(): PdpDraftInput {
  return { appState: "editor", preparedImage: null, modelImage: null, modelImageUsage: null,
    additionalInfo: "", desiredTone: "", aspectRatio: "3:4", notice: "", editorState: null,
    result: { originalImage: "AAAA", blueprint: { executiveSummary: "전략", scorecard: [], blueprintList: [],
      sections: [{ ...createEmptySection(0), headline: "A" }, { ...createEmptySection(0), headline: "B" }] } } };
}
describe("T-STATE: 문서 정본", () => {
  it("AI가 같은 ID를 줘도 편집 ID는 서로 다른 UUID가 된다", () => {
    const doc = createPdpDocument(source());
    expect(doc.sections[0].id).not.toBe(doc.sections[1].id);
    expect(doc.sections[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(doc.sections.map((s) => s.sourceSectionId)).toEqual(["S1", "S1"]);
  });
  it("섹션 변경은 revision과 승인 상태를 바꾸지만 이전 이미지는 남긴다", () => {
    const doc = createPdpDocument(source());
    doc.sections[0].generatedImage = "data:image/png;base64,AAAA";
    doc.approved = { revision: doc.revision, approvedAt: "now" };
    const updated = updatePdpDocument(doc, { type: "patchSection", id: doc.sections[0].id, patch: { headline: "C" } });
    expect(updated.revision).toBe(doc.revision + 1); expect(updated.approved).toBeUndefined();
    expect(updated.sections[0].generatedImage).toBe(doc.sections[0].generatedImage);
    expect(doc.sections[0].headline).toBe("A");
  });
  it("편집본을 이관하면 결과·레이어를 우선 보존하고 구성안과 같은 섹션을 반환한다", () => {
    const input = source(); const edited = { ...createEmptySection(0), headline: "편집됨", generatedImage: "image" };
    input.editorState = { currentSectionIndex: 0, sections: [edited], sectionKeys: ["S1"], sectionOptions: {},
      overlaysBySection: { S1: [{ id: "layer", kind: "shape", x: 1, y: 2, width: 3, height: 4, fillColor: "#fff", fillOpacity: 1, borderRadius: 0 }] },
      defaultCopyLanguage: "ko", notice: "", workbenchTab: "image", workbenchState: { x: 0, y: 0, width: 200, height: 200, isOpen: true } };
    const doc = createPdpDocument(input); const restored = documentToDraft(doc);
    expect(doc.sections[0].headline).toBe("편집됨");
    expect(restored.editorState?.sections).toBe(restored.result?.blueprint.sections);
    expect(restored.editorState?.overlaysBySection[doc.sections[0].id][0].id).toBe("layer");
  });
  it("텍스트 중간 데이터가 없는 저장 단계는 입력으로 복구한다", () => {
    const input = source(); input.startMode = "text"; input.result = null;
    const doc = createPdpDocument(input);
    expect(doc.stage).toBe("input");
  });
});

/*
  **서버에 저장된 작업을 열 때도 모델을 고친다**(2026-10-08 #294 검토). 전에는 브라우저 옛 저장칸만
  기본 모델로 바꿔, 서버에 경제형으로 저장된 작업(운영 2건)은 열어도 그대로라 그림 만들기가 계속 거절됐다.
*/
describe("저장된 모델 — 상세페이지 두 모델만", () => {
  it("상세페이지에서 안 쓰는 모델로 저장된 문서는 기본 모델로 연다", () => {
    for (const old of ["nano-banana", "gpt-image-2", "nano-banana-2"] as const) {
      const doc = createPdpDocument({ ...source(), imageModel: old });
      expect(documentToDraft(doc).imageModel).toBe("gpt-image-2.5-flare");
    }
  });

  it("두 모델 중 하나면 그대로 연다", () => {
    const doc = createPdpDocument({ ...source(), imageModel: "nano-banana-pro" });
    expect(documentToDraft(doc).imageModel).toBe("nano-banana-pro");
  });
});
