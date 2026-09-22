import { describe, expect, it } from "vitest";
import { buildImageJson } from "./pdp.image-prompt";
import { generateSectionImage } from "./index";
import type { SectionBlueprint } from "./types";

/**
 * **가로로 뽑으라 해 놓고 세로라고 말하지 않는다.**
 *
 * 2026-09-17 리뷰(U-07): 프롬프트의 `format.orientation` 이 `"vertical"` 로
 * 박혀 있었다. 화면에서 4:3·16:9 를 고르면 크기는 가로로 가는데 글은 세로라고
 * 말한다 — 모델이 둘 중 하나를 버린다.
 */
const section = {
  section_id: "S1",
  prompt_en: "a product on a table",
  headline: "제품",
  bullets: [],
  layout_notes: "",
} as unknown as SectionBlueprint;

const options = { style: "studio", withModel: false, outputMode: "full-image" } as const;

describe("화면비가 프롬프트의 방향을 정한다", () => {
  it.each([
    ["9:16", "vertical"],
    ["3:4", "vertical"],
    ["16:9", "horizontal"],
    ["4:3", "horizontal"],
    ["1:1", "square"],
  ])("%s 는 %s", (ratio, orientation) => {
    const brief = JSON.parse(buildImageJson(section, { ...options, aspectRatio: ratio as never }));

    expect(brief.format.orientation).toBe(orientation);
  });

  it("화면비를 안 주면 지금까지처럼 세로다", () => {
    const brief = JSON.parse(buildImageJson(section, options));

    expect(brief.format.orientation).toBe("vertical");
  });
});

describe("생성 경로가 화면비를 프롬프트까지 나른다", () => {
  it("가로 화면비로 만들면 프롬프트도 가로라고 말한다", async () => {
    const 보낸프롬프트: string[] = [];

    await generateSectionImage(
      { originalImageBase64: "AAAA", section, aspectRatio: "16:9", options: { style: "studio" } as never },
      {
        llm: { generate: async () => ({ text: "{}" }) },
        generateImage: async (_model: string, request: { prompt: string }) => {
          보낸프롬프트.push(request.prompt);
          return { imageBase64: "IMG", mimeType: "image/png" };
        },
      } as never,
    );

    expect(보낸프롬프트[0]).toContain('"orientation": "horizontal"');
  });
});
