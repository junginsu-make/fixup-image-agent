import { describe, expect, it } from "vitest";
import { IMAGE_MODELS, modelById } from "../models";
import { MATCH_SOURCE, chooseModelForRatio, nearestEnumRatio, sizeFromSource } from "../model-choice";

describe("첨부한 그림과 같은 비율로", () => {
  it("가로세로를 그대로 따라간다", () => {
    const size = sizeFromSource({ width: 1600, height: 900 }, modelById("gpt-image-2"));
    expect(size.pixel!.width / size.pixel!.height).toBeCloseTo(16 / 9, 2);
  });

  it("16 의 배수로 맞춘다", () => {
    // GPT Image 2 는 16 의 배수만 받는다.
    const size = sizeFromSource({ width: 1001, height: 777 }, modelById("gpt-image-2"));
    expect(size.pixel!.width % 16).toBe(0);
    expect(size.pixel!.height % 16).toBe(0);
  });

  it("너무 작으면 키운다", () => {
    // 최소 픽셀 수에 못 미치면 모델이 거부한다.
    const model = modelById("gpt-image-2");
    const size = sizeFromSource({ width: 200, height: 150 }, model);
    const pixels = size.pixel!.width * size.pixel!.height;
    expect(pixels).toBeGreaterThanOrEqual(model.pixelSizeLimits!.minPixels);
  });

  it("너무 크면 줄인다", () => {
    const model = modelById("gpt-image-2");
    const size = sizeFromSource({ width: 8000, height: 6000 }, model);
    expect(size.pixel!.width).toBeLessThanOrEqual(model.pixelSizeLimits!.maxEdge);
    expect(size.pixel!.height).toBeLessThanOrEqual(model.pixelSizeLimits!.maxEdge);
    expect(size.pixel!.width * size.pixel!.height)
      .toBeLessThanOrEqual(model.pixelSizeLimits!.maxPixels);
  });

  it("지나치게 긴 그림은 받지 않는다", () => {
    // 3:1 을 넘으면 모델이 거부한다. 조용히 잘라 다른 비율로 만들지 않는다.
    const size = sizeFromSource({ width: 4000, height: 500 }, modelById("gpt-image-2"));
    expect(size.rejected).toMatch(/비율/);
  });

  it("열거로만 받는 모델에는 못 쓴다", () => {
    const size = sizeFromSource({ width: 1600, height: 900 }, modelById("nano-banana"));
    expect(size.rejected).toBeTruthy();
  });
});

describe("가장 가까운 열거 비율 찾기", () => {
  it("16:9 사진은 16:9 로", () => {
    expect(nearestEnumRatio({ width: 1920, height: 1080 }, ["1:1", "16:9", "4:5"])).toBe("16:9");
  });

  it("정사각형에 가까우면 1:1 로", () => {
    expect(nearestEnumRatio({ width: 1000, height: 1010 }, ["1:1", "16:9", "4:5"])).toBe("1:1");
  });

  it("auto 는 후보에서 뺀다", () => {
    // 값이 아니라 "알아서" 라는 뜻이라 비교할 수 없다.
    expect(nearestEnumRatio({ width: 1000, height: 1000 }, ["auto", "16:9"])).toBe("16:9");
  });
});

describe("비율이 모델보다 우선한다", () => {
  it("고른 모델이 할 수 있으면 그대로 둔다", () => {
    const choice = chooseModelForRatio("1:1", "nano-banana", IMAGE_MODELS);
    expect(choice.model.id).toBe("nano-banana");
    expect(choice.switched).toBe(false);
  });

  it("못 하면 할 수 있는 모델로 바꾼다", () => {
    // A4 인쇄용은 픽셀을 직접 지정해야 해서 열거 모델로는 못 만든다.
    const choice = chooseModelForRatio("a4-print", "nano-banana", IMAGE_MODELS);
    expect(choice.model.id).toBe("gpt-image-2");
    expect(choice.switched).toBe(true);
    expect(choice.reason).toContain("Nano Banana");
  });

  it("첨부 비율 그대로는 픽셀을 지정할 수 있는 모델이라야 한다", () => {
    const choice = chooseModelForRatio(MATCH_SOURCE, "nano-banana-pro", IMAGE_MODELS);
    expect(choice.model.id).toBe("gpt-image-2");
    expect(choice.switched).toBe(true);
  });

  it("바꿀 이유를 남긴다", () => {
    // 조용히 바꾸면 사용자는 자기가 고른 모델로 만든 줄 안다.
    const choice = chooseModelForRatio("a4-print", "nano-banana", IMAGE_MODELS);
    expect(choice.reason).toBeTruthy();
  });

  it("모르는 모델을 주면 기본 모델로 본다", () => {
    const choice = chooseModelForRatio("1:1", "없는-모델", IMAGE_MODELS);
    expect(choice.model.id).toBe("gpt-image-2");
  });

  it("아무도 못 하는 비율이면 알린다", () => {
    const choice = chooseModelForRatio("없는-비율", "gpt-image-2", IMAGE_MODELS);
    expect(choice.reason).toBeTruthy();
  });
});
