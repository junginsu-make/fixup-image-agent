import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, pickEndpoint, unitPrice, modelById } from "../models";

describe("모델 목록", () => {
  it("넷을 담는다", () => {
    expect(IMAGE_MODELS.map((model) => model.id)).toEqual([
      "gpt-image-2", "nano-banana-pro", "nano-banana-2", "nano-banana",
    ]);
  });

  it("GPT Image 2 가 기본이다", () => {
    expect(IMAGE_MODELS[0]!.id).toBe("gpt-image-2");
    expect(IMAGE_MODELS[0]!.isDefault).toBe(true);
  });

  it("모든 모델이 t2i 와 i2i 엔드포인트를 갖는다", () => {
    for (const model of IMAGE_MODELS) {
      expect(model.t2i.endpoint).toMatch(/^(fal-ai|openai)\//);
      expect(model.i2i.endpoint).toMatch(/\/edit$/);
    }
  });
});

describe("엔드포인트 선택", () => {
  it("레퍼런스가 있으면 i2i", () => {
    // 카드뉴스는 레퍼런스가 필수라 사실상 항상 i2i 다.
    expect(pickEndpoint(modelById("gpt-image-2"), true)).toBe("openai/gpt-image-2/edit");
  });

  it("없으면 t2i", () => {
    // 엔딩 요약 페이지를 레퍼런스 없이 만들 때.
    expect(pickEndpoint(modelById("gpt-image-2"), false)).toBe("openai/gpt-image-2");
  });
});

describe("단가", () => {
  it("nano 는 고정 단가 × 해상도 배수", () => {
    // 우리는 2K 고정이다.
    expect(unitPrice(modelById("nano-banana-2"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.12, 4);
    expect(unitPrice(modelById("nano-banana-pro"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.15, 4);
    expect(unitPrice(modelById("nano-banana"), "i2i", { width: 1088, height: 1360 })).toBeCloseTo(0.039, 4);
  });

  it("GPT 는 t2i 와 i2i 가 다르다", () => {
    const square = { width: 1088, height: 1088 };
    expect(unitPrice(modelById("gpt-image-2"), "t2i", square)).toBeCloseTo(0.211, 4);
    expect(unitPrice(modelById("gpt-image-2"), "i2i", square)).toBeCloseTo(0.219, 4);
  });

  it("GPT 는 픽셀이 아니라 모양으로 표 행을 고른다", () => {
    // 이 표는 픽셀에 비례하지 않는다 — 1024x1536(1,572,864px)이
    // 1024x1024(1,048,576px)보다 싸다. 정사각형이 비싸다.
    const tall = unitPrice(modelById("gpt-image-2"), "i2i", { width: 1088, height: 1360 });
    const square = unitPrice(modelById("gpt-image-2"), "i2i", { width: 1088, height: 1088 });
    expect(tall).toBeCloseTo(0.178, 4);
    expect(square).toBeCloseTo(0.219, 4);
    expect(tall).toBeLessThan(square);
  });

  it("가로형은 가로형 행을 쓴다", () => {
    expect(unitPrice(modelById("gpt-image-2"), "i2i", { width: 2048, height: 1152 })).toBeCloseTo(0.158, 4);
  });
});

describe("참고 이미지 상한", () => {
  it("GPT 는 16장, nano 는 14장", () => {
    expect(modelById("gpt-image-2").maxReferenceImages).toBe(16);
    expect(modelById("nano-banana-2").maxReferenceImages).toBe(14);
    expect(modelById("nano-banana-pro").maxReferenceImages).toBe(14);
  });
});
