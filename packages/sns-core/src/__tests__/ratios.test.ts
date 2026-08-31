import { describe, expect, it } from "vitest";
import { CARD_RATIOS, resolveSize } from "../ratios";
import { modelById } from "../models";

describe("비율 목록", () => {
  it("넷을 제공한다", () => {
    expect(CARD_RATIOS.map((ratio) => ratio.id)).toEqual(["4:5", "1:1", "9:16", "16:9"]);
  });

  it("모든 픽셀이 GPT Image 2 제약을 만족한다", () => {
    const limits = modelById("gpt-image-2").pixelSizeLimits!;
    for (const ratio of CARD_RATIOS) {
      const { width, height } = ratio.pixel;
      expect(width % limits.multipleOf).toBe(0);
      expect(height % limits.multipleOf).toBe(0);
      expect(width * height).toBeGreaterThanOrEqual(limits.minPixels);
      expect(width * height).toBeLessThanOrEqual(limits.maxPixels);
      expect(Math.max(width, height)).toBeLessThanOrEqual(limits.maxEdge);
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(limits.maxAspect);
    }
  });
});

describe("모델에 보낼 값", () => {
  it("GPT 는 픽셀을 준다", () => {
    const resolved = resolveSize("4:5", modelById("gpt-image-2"));
    expect(resolved.mode).toBe("pixel");
    expect(resolved.pixel).toEqual({ width: 1088, height: 1360 });
  });

  it("nano 는 비율 문자열과 고정 해상도를 준다", () => {
    const resolved = resolveSize("9:16", modelById("nano-banana-2"));
    expect(resolved.mode).toBe("enum");
    expect(resolved.aspectRatio).toBe("9:16");
    expect(resolved.resolution).toBe("2K");
  });

  it("네 비율은 모든 모델이 지원한다 — 대체가 없다", () => {
    for (const ratio of CARD_RATIOS) {
      for (const id of ["gpt-image-2", "nano-banana-pro", "nano-banana-2"]) {
        expect(resolveSize(ratio.id, modelById(id)).rejected).toBeUndefined();
      }
    }
  });

  it("모르는 비율은 거절한다", () => {
    expect(resolveSize("21:9", modelById("gpt-image-2")).rejected).toBeTruthy();
  });
});
