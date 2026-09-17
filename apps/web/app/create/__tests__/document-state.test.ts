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
