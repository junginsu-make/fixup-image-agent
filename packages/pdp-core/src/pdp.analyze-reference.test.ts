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

/**
 * 구성안을 짜는 호출을 집는다.
 *
 * 인물 사진이 있으면 **인물 특징 뽑기가 먼저** 불린다. 첫 호출을 그냥 보면
 * 엉뚱한 것을 재게 된다 — 실제로 한 번 그렇게 틀렸다.
 */
const BLUEPRINT_MARK = "섹션 템플릿";

async function imagesSentFor(
  styleReference?: typeof 레퍼런스,
  extra: Record<string, unknown> = {},
) {
  const service = new PdpService();
  sentPrompts.length = 0;
  const seen: Array<{ base64: string; mimeType: string }[]> = [];
  const llm = {
    generate: async (request: { prompt: string; images?: Array<{ base64: string; mimeType: string }> }) => {
      if (request.prompt.includes(BLUEPRINT_MARK)) {
        seen.push(request.images ?? []);
        sentPrompts.push(request.prompt);
      }
      return { text: blueprint };
    },
  };

  await service.analyzeProduct(
    {
      imageBase64: "iVBORw0KGgo=",
      mimeType: "image/png",
      aspectRatio: "3:4",
      styleReference,
      ...extra,
    },
    {
      llm,
      // 이 시험은 그림을 안 만든다(skipFirstImage). 통로만 채워 둔다.
      generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }),
    },
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

/**
 * 2차 독립 리뷰가 잡은 것들.
 *
 * 이 저장소는 같은 문제를 이미 한 번 풀었다 — `pdp.reference-policy.ts` 가
 * 「우선순위 한 줄로는 못 이긴다. 반대편이 여섯 문장이고 전부 구체적이다」라고
 * 적어 두고 역할 문구를 통째로 뺀다. 새 블록이 그것과 반대로 하면 안 된다.
 */
describe("이미지 경로와 같은 방식을 쓴다", () => {
  it("우선하는 범위를 그 그림으로 좁힌다 — 「다른 지시」로 두면 근거 규칙까지 이긴다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: { intent: "색만 가져와" },
    });
    expect(prompt).not.toContain("다른 지시보다 우선");
    expect(prompt).toMatch(/이 그림에 대해서는/);
  });

  it("서술은 지시 뒤에 놓고 어느 쪽이 센지 밝힌다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: { description: "가운데 정렬에 위 여백이 넓다", intent: "배치는 무시해 주세요" },
    });
    const 지시 = prompt.indexOf("배치는 무시해 주세요");
    const 서술 = prompt.indexOf("가운데 정렬에 위 여백이 넓다");
    expect(지시).toBeGreaterThan(-1);
    expect(서술).toBeGreaterThan(지시);
    expect(prompt).toMatch(/참고용|위 지시가 이긴다/);
  });

  it("지시가 없으면 서술에 그런 단서를 안 붙인다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: { description: "가운데 정렬에 위 여백이 넓다" },
    });
    expect(prompt).toContain("가운데 정렬에 위 여백이 넓다");
    expect(prompt).not.toMatch(/위 지시가 이긴다/);
  });
});

/**
 * `style_guide` 를 한 프롬프트가 두 번, 다른 어휘로 정의하고 있었다.
 *
 * 앞은 그래픽 디자인 어휘(레이아웃·색 쓰임·서체), 뒤는 사진 연출 어휘
 * (세트·조명·질감). 뒤가 54줄 더 뒤에 있어 이 파일 자신의 규칙대로면 뒤가 이긴다.
 */
describe("style_guide 를 두 번 정의하지 않는다", () => {
  it("레퍼런스가 있으면 섹션 템플릿도 그 그림을 기준으로 말한다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "editable", undefined, "normal", "ask", {
      styleReference: { description: "짙은 올리브" },
    });
    const 템플릿줄 = prompt.split("\n").find((line) => line.startsWith("- style_guide:")) ?? "";
    expect(템플릿줄).toMatch(/레퍼런스/);
    expect(템플릿줄).not.toMatch(/스튜디오는 정제된 세트/);
  });

  it("레퍼런스가 없으면 예전 설명 그대로다", () => {
    const 템플릿줄 = buildAnalyzePrompt().split("\n").find((line) => line.startsWith("- style_guide:")) ?? "";
    expect(템플릿줄).toMatch(/스튜디오는 정제된 세트/);
  });

  /**
   * `pdp.image-prompt.ts:136` 은 `design_system = style_guide` 를 조건 없이 한다.
   * 「디자인 가이드 우선 모드에서만 강하게」는 그 사실과 어긋나고, 기획에게
   * 스스로 힘을 빼라고 말하는 셈이다.
   */
  it("스스로 힘을 빼라고 말하지 않는다", () => {
    expect(buildAnalyzePrompt()).not.toMatch(/디자인 가이드 우선 모드에서만/);
  });
});

describe("그림 순서 — 제품 · 인물 · 레퍼런스", () => {
  it("인물이 있어도 레퍼런스가 맨 뒤다", async () => {
    const images = await imagesSentFor(레퍼런스, { modelImageBase64: "PERSON", modelImageMimeType: "image/png" });
    expect(images.map((image) => image.base64)).toEqual(["iVBORw0KGgo=", "PERSON", "REF"]);
  });
});

describe("레퍼런스도 다른 첨부와 같은 손질을 거친다", () => {
  it("data: 접두사가 붙어 와도 벗긴다", async () => {
    const images = await imagesSentFor({
      ...레퍼런스,
      imageBase64: "data:image/png;base64,REF",
    } as typeof 레퍼런스);
    expect(images[1]!.base64).toBe("REF");
  });

  /** 제품·인물과 같다. 조용히 되돌리지 않고 거절한다 — 무엇이 잘못됐는지 알려야 한다. */
  it("그림이 아닌 형식은 거절한다", async () => {
    await expect(
      imagesSentFor({ ...레퍼런스, mimeType: "text/plain" } as typeof 레퍼런스),
    ).rejects.toMatchObject({ code: "INVALID_IMAGE_PAYLOAD" });
  });
});
