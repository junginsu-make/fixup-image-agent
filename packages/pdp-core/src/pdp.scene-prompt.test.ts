import { describe, expect, it } from "vitest";
import { normalizeTextBlueprint, mergeArtDirection } from "./pdp.text-plan";
import { PdpService } from "./pdp.service";
import { buildImageJson } from "./pdp.image-prompt";

// 기획 AI의 빈 장면 지시 때문에 이후 생성이 막혔다. 입력 경로와 무관하게 복구한다.
const fallback = "product centered on a bright clean studio background, soft even lighting";
describe("사진과 글 기획의 장면 지시", () => {
  it.each([
    [{ prompt_en: "english", prompt_ko: "장면" }, "english"],
    [{ prompt_en: " \n", prompt_ko: "장면", headline: "제목" }, "장면"],
    [{ headline: "제목", section_name: "이름" }, "제목"],
    [{ section_name: "이름" }, "이름"],
    [{}, fallback],
  ])("두 기획 경로가 같은 대체값을 쓴다: %j", async (raw, expected) => {
    const text = normalizeTextBlueprint({ sections: [raw] });
    const photo = await new PdpService().analyzeProduct(
      { imageBase64: "iVBORw0KGgo=", mimeType: "image/png" } as never,
      { llm: { generate: async () => ({ text: JSON.stringify({ sections: [raw] }) }) } } as never,
      { skipFirstImage: true },
    );
    expect(text.sections[0].prompt_en).toBe(expected);
    expect(photo.blueprint.sections[0].prompt_en).toBe(expected);
  });
  it("장면을 고치지 않은 옛 기획도 복구하고 사용자 변경은 우선한다", () => {
    const bp = normalizeTextBlueprint({ sections: [{ prompt_ko: "원래 장면" }] });
    bp.sections[0].prompt_en = "";
    expect(mergeArtDirection(bp, bp).sections[0].prompt_en).toBe("원래 장면");
    const edited = { ...bp, sections: [{ ...bp.sections[0], prompt_ko: "사용자 장면" }] };
    expect(mergeArtDirection(bp, edited).sections[0].prompt_en).toBe("사용자 장면");
  });
  it("최종 프롬프트도 모두 빈 경우 기본 장면을 쓴다", () => {
    const section = normalizeTextBlueprint({ sections: [{}] }).sections[0];
    Object.assign(section, { prompt_en: " ", prompt_ko: "", headline: "", section_name: "" });
    const json = buildImageJson(section, { style: "studio", aspectRatio: "9:16" } as never);
    expect(JSON.parse(json).scene.subject).toBe(fallback);
  });
});
