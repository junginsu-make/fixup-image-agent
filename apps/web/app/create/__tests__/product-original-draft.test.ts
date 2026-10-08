import { describe, expect, it } from "vitest";
import { createPdpDocument, documentToDraft } from "../document-state";
import type { PdpDraftInput } from "../pdp-drafts";

/** 원본은 1024 사본과 **따로** 남는다(설계 2026-10-08 §4.6). 다시 열어도 원본으로 만든다. */
const draft = (original?: { base64: string; mimeType: string }) =>
  ({
    preparedImage: { base64: "SMALL", mimeType: "image/jpeg", previewUrl: "data:image/jpeg;base64,SMALL", fileName: "p.jpg", ...(original ? { original } : {}) },
    modelImage: null, modelImageUsage: null, result: null, additionalInfo: "", desiredTone: "", aspectRatio: "3:4",
    appState: "upload", notice: "",
  }) as unknown as PdpDraftInput;

describe("제품 원본 임시저장", () => {
  it("원본이 있으면 저장했다 다시 열어도 원본이 그대로", () => {
    const reopened = documentToDraft(createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" })));
    expect(reopened.preparedImage?.base64).toBe("SMALL");
    expect(reopened.preparedImage?.original).toEqual({ base64: "ORIGINAL", mimeType: "image/png" });
  });

  it("원본이 없는 옛 작업은 원본 없이 열린다", () => {
    const reopened = documentToDraft(createPdpDocument(draft()));
    expect(reopened.preparedImage?.original).toBeUndefined();
  });

  it("1024 사본 그림 안에 원본이 겹쳐 담기지 않는다", () => {
    const doc = createPdpDocument(draft({ base64: "ORIGINAL", mimeType: "image/png" }));
    const ref = doc.references.find((r) => r.role === "product")!;
    expect(Object.hasOwn(doc.assets[ref.assetId], "original")).toBe(false);
    expect(doc.assets[ref.originalAssetId!].base64).toBe("ORIGINAL");
  });
});
