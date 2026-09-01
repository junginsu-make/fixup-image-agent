import { describe, expect, it } from "vitest";
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
