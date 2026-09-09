import { describe, expect, it } from "vitest";
import { PdpService, buildAnalyzePrompt } from "./pdp.service";

/**
 * **기획이 디자인 레퍼런스를 본다.**
 *
 * 전에는 `/api/pdp/analyze` 에 `reference` 라는 글자가 0회였다. 레퍼런스는
 * 이미지를 만들 때 처음 등장했고, 구성안을 짜는 단계에서는 존재조차 몰랐다.
 *
 * 그래서 구성안의 `style_guide`(전체 통일 스타일)를 기획이 **상상으로** 채웠다.
 * 그 값은 그대로 이미지 프롬프트의 `design_system` 이 된다 —
 * `pdp.image-prompt.ts:136`. 레퍼런스를 붙여 놓고도 구성이 그것과 무관하게
 * 짜이던 이유다.
 *
 * 채울 자리는 이미 있었다. 없던 것은 **볼 기회**였다.
 */

const 레퍼런스 = {
  imageBase64: "REF",
  mimeType: "image/png",
  description: "짙은 올리브가 배경 띠를 채우고, 가운데 정렬에 위 여백이 넓다",
};

describe("구성안을 짤 때 레퍼런스를 알려 준다", () => {
  it("레퍼런스가 있다고 말한다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: 레퍼런스,
    });
    expect(prompt).toMatch(/design reference/i);
  });

  it("어떤 디자인인지 적은 서술이 실린다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: 레퍼런스,
    });
    expect(prompt).toContain("짙은 올리브가 배경 띠를 채우고");
  });

  it("사용자가 그 그림에 대해 적은 말도 실린다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: { ...레퍼런스, intent: "색만 가져오고 배치는 무시해 주세요" },
    });
    expect(prompt).toContain("색만 가져오고 배치는 무시해 주세요");
  });

  /** 레퍼런스는 「어떻게 보이는가」만 준다. 내용은 이 제품의 것이어야 한다. */
  it("그 안의 제품·사람·문구는 가져오지 말라고 못 박는다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: 레퍼런스,
    });
    expect(prompt).toMatch(/not.*(its product|copy).*/i);
    expect(prompt).toMatch(/style_guide/);
  });

  it("레퍼런스가 없으면 그 이야기를 아예 안 한다", () => {
    const prompt = buildAnalyzePrompt();
    expect(prompt).not.toMatch(/design reference/i);
  });

  it("옛 호출 모양이 그대로 동작한다 — 인자를 안 줘도 된다", () => {
    expect(() => buildAnalyzePrompt("정보", "톤", null, "editable")).not.toThrow();
  });
});

const blueprint = JSON.stringify({
  executiveSummary: "요약",
  scorecard: [],
  blueprintList: [],
  sections: [
    {
      section_id: "s1",
      section_name: "히어로",
      goal: "관심",
      headline: "제목",
      subheadline: "부제",
      prompt_en: "a clean product photo",
      layout_notes: "",
    },
  ],
});

const sentPrompts: string[] = [];

async function imagesSentFor(styleReference?: typeof 레퍼런스) {
  const service = new PdpService();
  sentPrompts.length = 0;
  const seen: Array<{ base64: string }[]> = [];
  const llm = {
    generate: async (request: { prompt: string; images?: Array<{ base64: string; mimeType: string }> }) => {
      seen.push(request.images ?? []);
      sentPrompts.push(request.prompt);
      return { text: blueprint };
    },
  };

  await service.analyzeProduct(
    {
      imageBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      aspectRatio: "3:4",
      styleReference,
    },
    llm,
    { skipFirstImage: true },
  );

  return seen[0] ?? [];
}

/** 그림도 실제로 함께 보내야 한다. 말만 하고 안 보내면 모델은 볼 수 없다. */
describe("레퍼런스 그림이 함께 간다", () => {
  it("레퍼런스가 없으면 제품 사진 한 장만 간다", async () => {
    expect(await imagesSentFor()).toHaveLength(1);
  });

  it("레퍼런스가 있으면 두 장이 간다 — 제품이 먼저다", async () => {
    const images = await imagesSentFor(레퍼런스);
    expect(images).toHaveLength(2);
    expect(images[1]!.base64).toBe("REF");
  });
});

/**
 * **그림과 말은 배선이 둘이다.**
 *
 * 변이로 재 보니 그림만 보내고 프롬프트에 아무 말도 안 실어도 시험이 전부
 * 통과했다. 2026-09-08 카드뉴스에서 겪은 것과 같은 모양이다 — 절반만 옮기면
 * 모델은 붙은 그림을 무엇으로 봐야 할지 모른 채 받는다.
 *
 * 그래서 `analyzeProduct` 가 실제로 보낸 프롬프트를 붙잡아 본다.
 */
describe("보낸 프롬프트에 레퍼런스 이야기가 실린다", () => {
  it("서술이 실제로 나간다", async () => {
    await imagesSentFor(레퍼런스);
    expect(sentPrompts[0]).toContain("짙은 올리브가 배경 띠를 채우고");
    expect(sentPrompts[0]).toMatch(/design reference/i);
  });

  it("사용자가 적은 말도 실제로 나간다", async () => {
    await imagesSentFor({ ...레퍼런스, intent: "색만 가져오고 배치는 무시해 주세요" } as typeof 레퍼런스);
    expect(sentPrompts[0]).toContain("색만 가져오고 배치는 무시해 주세요");
  });

  it("레퍼런스가 없으면 그 이야기가 안 나간다", async () => {
    await imagesSentFor();
    expect(sentPrompts[0]).not.toMatch(/design reference/i);
  });
});
