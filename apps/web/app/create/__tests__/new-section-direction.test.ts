import { expect, it } from "vitest";
import { mergeArtDirection } from "@fixup/pdp-core";
import { createSectionFor } from "../scenario-sections";

it("T-SECTION: 새 섹션도 고친 장면을 실제 생성 지시로 전달한다", () => {
  const original = { executiveSummary: "", scorecard: [], blueprintList: [], sections: [] };
  const section = { ...createSectionFor([]), prompt_ko: "눈 덮인 산 위의 제품" };
  const merged = mergeArtDirection(original, { ...original, sections: [section] });
  expect(merged.sections[0].prompt_en).toContain("눈 덮인 산 위의 제품");
  expect(merged.sections[0].prompt_en).not.toContain("bright clean studio");
});
