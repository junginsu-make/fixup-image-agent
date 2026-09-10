import { describe, expect, it } from "vitest";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { buildPosterJob, posterImageRows } from "../generate";
import { EMPTY_SLOTS } from "../schemas";

const base = {
  projectId: "p1",
  modelId: "gpt-image-2",
  ratioId: "2:3",
  variants: 3,
  slots: { ...EMPTY_SLOTS, headline: "가을, 셔터를 누르다", scene: "해질녘 골목" },
  referenceUrls: ["https://fal.media/ref-1.png"],
  preservedUrls: [] as string[],
};

describe("지킬 대상이 사람인지 물건인지 프롬프트까지 간다", () => {
  it("사람으로 표시한 것만 사람으로 다룬다", () => {
    const job = buildPosterJob({
      ...base,
      preservedUrls: ["https://fal.media/model.png", "https://fal.media/product.png"],
      personUrls: ["https://fal.media/model.png"],
    });
    expect(job.prompt).toMatch(/PRESERVED PERSON/);
    expect(job.prompt).toMatch(/PRESERVED SUBJECT/);
  });

  it("표시가 없으면 전부 물건으로 다룬다", () => {
    // 옛 작업에는 이 값이 없다. 사람으로 보면 없는 얼굴을 지키려 든다.
    const job = buildPosterJob({ ...base, preservedUrls: ["https://fal.media/product.png"] });
    expect(job.prompt).not.toMatch(/PRESERVED PERSON/);
  });
});

describe("포스터 작업 조립", () => {
  it("레퍼런스가 있으면 편집 엔드포인트로 간다", () => {
    const job = buildPosterJob(base);
    expect(job.mode).toBe("i2i");
    expect(job.endpoint).toBe("openai/gpt-image-2/edit");
    expect(job.input.image_urls).toEqual(["https://fal.media/ref-1.png"]);
  });

  it("레퍼런스가 없으면 생성 엔드포인트로 간다", () => {
    const job = buildPosterJob({ ...base, referenceUrls: [] });
    expect(job.mode).toBe("t2i");
    expect(job.endpoint).toBe("openai/gpt-image-2");
    expect(job.input.image_urls).toBeUndefined();
  });

  it("변형 수를 그대로 요청한다 — 포스터는 N장을 다 저장한다", () => {
    expect(buildPosterJob(base).input.num_images).toBe(3);
  });

  it("보존 대상은 레퍼런스 뒤에 붙는다 — 번호가 프롬프트와 맞아야 한다", () => {
    const job = buildPosterJob({
      ...base,
      preservedUrls: ["https://fal.media/product.png"],
    });
    expect(job.input.image_urls).toEqual([
      "https://fal.media/ref-1.png",
      "https://fal.media/product.png",
    ]);
    expect(job.prompt.indexOf("Image 1 is a POSTER REFERENCE"))
      .toBeLessThan(job.prompt.indexOf("Image 2 is a PRESERVED SUBJECT"));
  });

  it("GPT 는 픽셀과 품질을 명시한다 — auto 는 입력 크기를 물려받는다", () => {
    const job = buildPosterJob(base);
    expect(job.input.image_size).toEqual({ width: 1024, height: 1536 });
    expect(job.input.quality).toBe("high");
  });

  /**
   * 카드뉴스와 **같은 규칙**이다. 품질을 모델이 정하고, 값은 그 모델의 표에서
   * 나온다. 두 곳이 갈리면 여기만 조용히 틀린 값으로 차감한다.
   */
  it("품질을 모델에서 받는다", () => {
    for (const model of IMAGE_MODELS) {
      if (!model.pixelSizeLimits) continue; // nano 계열은 품질 칸이 없다
      const job = buildPosterJob({ ...base, modelId: model.id });
      expect(job.input.quality, model.id).toBe(model.quality ?? "high");
    }
  });

  it("열거 모델은 비율 문자열을 준다", () => {
    const job = buildPosterJob({ ...base, modelId: "nano-banana-pro" });
    expect(job.input.aspect_ratio).toBe("2:3");
    expect(job.input.image_size).toBeUndefined();
  });

  it("비용은 변형 수만큼이다", () => {
    const job = buildPosterJob(base);
    expect(job.estimate.unitUsd).toBe(0.178);
    expect(job.estimate.totalUsd).toBeCloseTo(0.534, 4);
  });

  it("만들 수 없는 조합이면 이유를 주고 작업을 만들지 않는다", () => {
    const job = buildPosterJob({ ...base, modelId: "nano-banana-pro", ratioId: "a4-print" });
    expect(job.rejected).toMatch(/인쇄/);
    expect(job.input).toEqual({});
  });

  it("웹 검색이나 추론 옵션을 켜지 않는다", () => {
    const input = buildPosterJob(base).input;
    expect(input.web_search).toBeUndefined();
    expect(input.thinking_level).toBeUndefined();
  });
});

describe("결과를 이미지 행으로", () => {
  const images = [
    { url: "https://fal.media/out-1.png", width: 1024, height: 1536 },
    { url: "https://fal.media/out-2.png" },
  ];

  it("받은 장수만큼 행을 만든다 — 요청은 한 행이다", () => {
    const rows = posterImageRows({ projectId: "p1", generationRequestId: "g1", images, paths: ["a.png", "b.png"] });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.generationRequestId)).size).toBe(1);
  });

  it("변형 번호를 0부터 붙인다", () => {
    const rows = posterImageRows({ projectId: "p1", generationRequestId: "g1", images, paths: ["a.png", "b.png"] });
    expect(rows.map((row) => row.variantIndex)).toEqual([0, 1]);
  });

  it("크기를 모르면 지어내지 않는다", () => {
    const rows = posterImageRows({ projectId: "p1", generationRequestId: "g1", images, paths: ["a.png", "b.png"] });
    expect(rows[1]!.width).toBeNull();
  });

  it("저장 경로 수가 안 맞으면 던진다 — 조용히 잃으면 안 된다", () => {
    expect(() => posterImageRows({
      projectId: "p1", generationRequestId: "g1", images, paths: ["a.png"],
    })).toThrow();
  });

  it("비용을 이미지 행에 넣지 않는다 — 요청 행에만 있다", () => {
    const rows = posterImageRows({ projectId: "p1", generationRequestId: "g1", images, paths: ["a.png", "b.png"] });
    for (const row of rows) expect(row).not.toHaveProperty("costUsd");
  });
});

describe("참조 이미지 장수 상한", () => {
  const small = {
    projectId: "p1", modelId: "nano-banana", ratioId: "2:3", variants: 1,
    slots: EMPTY_SLOTS, referenceUrls: [] as string[], preservedUrls: [] as string[],
  };
  const urls = (count: number, prefix: string) =>
    Array.from({ length: count }, (_unused, index) => `https://x/${prefix}${index}.png`);

  it("상한을 넘으면 만들기 전에 막는다", () => {
    // 조용히 자르면 지키려던 제품이 사라진 채로 그림이 나오고, 사용자는 왜
    // 안 들어갔는지 알 수 없다. Nano Banana 는 7장까지다.
    const job = buildPosterJob({ ...small, referenceUrls: urls(8, "r") });
    expect(job.rejected).toMatch(/7장/);
    expect(job.prompt).toBe("");
  });

  it("따라 만들기와 지키기를 합쳐서 센다", () => {
    // 둘 다 같은 요청에 함께 간다. 따로 세면 상한을 넘긴 채 통과한다.
    const job = buildPosterJob({
      ...small, referenceUrls: urls(4, "r"), preservedUrls: urls(4, "p"),
    });
    expect(job.rejected).toBeTruthy();
  });

  it("상한 안이면 그대로 만든다", () => {
    const job = buildPosterJob({ ...small, referenceUrls: urls(7, "r") });
    expect(job.rejected).toBeUndefined();
  });

  it("모델마다 상한이 다르다", () => {
    // 같은 8장이 Nano Banana 에서는 막히고 Pro 에서는 지나간다.
    expect(buildPosterJob({ ...small, referenceUrls: urls(8, "r") }).rejected).toBeTruthy();
    expect(
      buildPosterJob({ ...small, modelId: "nano-banana-pro", referenceUrls: urls(8, "r") }).rejected,
    ).toBeUndefined();
  });
});

/**
 * 이 배선이 이 기능의 존재 이유다.
 *
 * `buildPosterPrompt` 를 직접 부르는 시험은 있었는데, **`buildPosterJob` 을
 * 통과해 오는 길**을 보는 시험이 없었다. `generate.ts` 에서 그 두 줄을
 * `undefined` 로 바꿔도 시험 81개가 전부 초록이었다 — 사용자가 01 화면에 뭐라고
 * 적든 프롬프트에 안 들어가고, **오류 하나 없이 예전 결과가 나온다**(2026-09-08 리뷰).
 */
describe("사용자가 적은 말이 프롬프트까지 간다", () => {
  it("첨부에 대한 말이 조립을 거쳐 프롬프트에 들어간다", () => {
    const job = buildPosterJob({
      ...base,
      attachmentIntent: "1번 사진의 사람들을 2번 그림 느낌으로",
    });
    expect(job.prompt).toContain("첨부한 그림에 대해: 1번 사진의 사람들을 2번 그림 느낌으로");
  });

  it("결과물에 대한 말도 조립을 거쳐 프롬프트에 들어간다", () => {
    const job = buildPosterJob({ ...base, userInstruction: "배경은 밤, 창밖에 네온" });
    expect(job.prompt).toContain("결과물에 대해: 배경은 밤, 창밖에 네온");
  });

  it("둘 다 있으면 첨부에 대한 말이 먼저다", () => {
    // 첨부를 어떻게 쓸지가 결과물을 어떻게 할지보다 앞선다 — 설계 §5 3번.
    const job = buildPosterJob({
      ...base,
      attachmentIntent: "1번을 2번 느낌으로",
      userInstruction: "배경은 밤",
    });
    expect(job.prompt.indexOf("첨부한 그림에 대해")).toBeLessThan(
      job.prompt.indexOf("결과물에 대해"),
    );
  });

  it("둘 다 프롬프트 맨 앞에 온다 — 화풍 지시보다 먼저", () => {
    const job = buildPosterJob({ ...base, attachmentIntent: "1번을 2번 느낌으로" });
    expect(job.prompt.startsWith("USER INSTRUCTION")).toBe(true);
  });

  it("안 적었으면 아무것도 안 들어간다", () => {
    const job = buildPosterJob(base);
    expect(job.prompt).not.toContain("첨부한 그림에 대해");
    expect(job.prompt).not.toContain("USER INSTRUCTION");
  });
});
