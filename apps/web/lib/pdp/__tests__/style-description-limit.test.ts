import { describe, expect, it, vi } from "vitest";
import { MAX_STRATEGY_LENGTH, normalizeStyleAnalysis } from "@fixup/pdp-core";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }) }));
const { readPdpRequest } = await import("../request");

// 서버 AI가 쓴 레퍼런스 서술 때문에 다음 기획/생성이 거절되지 않아야 한다.
describe("레퍼런스 서술 상한", () => {
  it("분석 결과부터 2,000자 이내로 만든다", () => {
    expect(normalizeStyleAnalysis({ palette: "가".repeat(2001) })).toHaveLength(MAX_STRATEGY_LENGTH);
  });
  it.each(["analyze", "single", "batch", "keyVisual"] as const)("%s는 옛 긴 서술도 잘라 받는다", async (kind) => {
    const styleReference = { imageBase64: "AAAA", mimeType: "image/png", description: "가".repeat(2001) };
    const section = { section_id: "S1", prompt_en: "scene" };
    const body = { imageBase64: "AAAA", mimeType: "image/png", originalImageBase64: "AAAA",
      section, sections: [section], blueprint: { sections: [section] }, brief: { offeringName: "상품" },
      styleReference, page: { styleReference } };
    const result = await readPdpRequest<typeof body>(new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) }), kind);
    expect(result.ok).toBe(true);
    if (result.ok) expect((kind === "analyze" ? result.body.styleReference : result.body.page.styleReference).description).toHaveLength(2000);
  });
});
