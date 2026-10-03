import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }) }));
const { readPdpRequest } = await import("../request");
const { PdpService, generateKeyVisual, normalizeBrief, normalizeTextBlueprint } = await import("@fixup/pdp-core");

// 새 기획만 고쳐서는 브라우저에 저장된 빈 장면의 초안을 살릴 수 없다.
describe("옛 초안의 그림 설명", () => {
  it("빈 설명으로도 실제 생성 조립기가 대체 장면을 모델에 전달한다", async () => {
    const section = { ...normalizeTextBlueprint({ sections: [{ prompt_ko: "제품 정면" }] }).sections[0], prompt_en: "" };
    const generateImage = vi.fn(async () => ({ base64: "AAAA", mimeType: "image/png" }));
    const service = new PdpService();
    await Reflect.get(service, "generateSectionImageInternal").call(service, {
      originalImageBase64: "AAAA", section, aspectRatio: "9:16",
      client: {}, generateImage, options: { withModel: false, outputMode: "editable" },
    });
    expect(JSON.stringify(generateImage.mock.calls)).toContain("제품 정면");
    const blueprint=normalizeTextBlueprint({sections:[section]});
    blueprint.sections[0].prompt_en="";
    await generateKeyVisual({ aspectRatio: "9:16", brief: normalizeBrief({ offeringName: "상품" }, "상품"),
      blueprint },
      { generateImage, generateJson: vi.fn() });
    expect(generateImage).toHaveBeenCalledTimes(2);
  });
  it.each(["single", "batch", "keyVisual"] as const)("%s는 빈칸·누락·공백을 받는다", async (kind) => {
    for (const prompt_en of ["", undefined, " \n"]) {
      const section = { section_id: "S1", prompt_en, prompt_ko: "제품 정면" };
      const body = kind === "single" ? { originalImageBase64: "AAAA", section }
        : kind === "batch" ? { originalImageBase64: "AAAA", sections: [section] }
          : { brief: { offeringName: "상품" }, blueprint: { sections: [section] } };
      const parsed = await readPdpRequest(new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) }), kind);
      expect(parsed.ok).toBe(true);
    }
  });
  it("섹션 번호와 문자열 형식은 계속 검사한다", async () => {
    for (const section of [{ section_id: "", prompt_en: "" }, { section_id: "S1", prompt_en: 123 }]) {
      const parsed = await readPdpRequest(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ originalImageBase64: "AAAA", section }) }), "single");
      expect(parsed.ok).toBe(false);
    }
  });
});
