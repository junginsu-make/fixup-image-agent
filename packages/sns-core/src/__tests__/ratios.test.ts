import { describe, expect, it } from "vitest";
import { CARD_RATIOS, POSTER_RATIOS, resolvePosterSize, resolveSize } from "../ratios";
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

  it("고정 해상도가 없는 모델은 해상도를 지어내지 않는다", () => {
    const resolved = resolveSize("4:5", modelById("nano-banana"));
    expect(resolved.mode).toBe("enum");
    expect(resolved.aspectRatio).toBe("4:5");
    expect(resolved.resolution).toBeUndefined();
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

describe("포스터 비율", () => {
  it("아홉을 제공한다 — 카드뉴스 넷에 포스터·인쇄 규격과 원본 따라가기를 더한다", () => {
    expect(POSTER_RATIOS.map((ratio) => ratio.id)).toEqual([
      "4:5", "1:1", "9:16", "2:3", "3:4", "16:9", "a4-draft", "a4-print", "match-source",
    ]);
  });

  it("카드뉴스 목록은 넷 그대로다 — 포스터 비율이 섞이면 안 된다", () => {
    expect(CARD_RATIOS).toHaveLength(4);
  });

  it("모든 픽셀이 GPT Image 2 제약을 만족한다", () => {
    const limits = modelById("gpt-image-2").pixelSizeLimits!;
    for (const ratio of POSTER_RATIOS) {
      const { width, height } = ratio.pixel;
      expect(width % limits.multipleOf).toBe(0);
      expect(height % limits.multipleOf).toBe(0);
      expect(width * height).toBeGreaterThanOrEqual(limits.minPixels);
      expect(width * height).toBeLessThanOrEqual(limits.maxPixels);
      expect(Math.max(width, height)).toBeLessThanOrEqual(limits.maxEdge);
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(limits.maxAspect);
    }
  });

  it("A4 인쇄용은 약 290dpi, 시안은 그 절반 이하다", () => {
    // A4 는 210×297mm = 8.27×11.69인치.
    const dpi = (id: string) =>
      Math.round(POSTER_RATIOS.find((ratio) => ratio.id === id)!.pixel.width / 8.27);
    expect(dpi("a4-print")).toBeGreaterThanOrEqual(280);
    expect(dpi("a4-draft")).toBeLessThan(150);
  });

  it("A4 비율 오차가 작다", () => {
    for (const id of ["a4-draft", "a4-print"]) {
      const ratio = POSTER_RATIOS.find((entry) => entry.id === id)!;
      const actual = ratio.pixel.height / ratio.pixel.width;
      expect(Math.abs(actual - Math.SQRT2) / Math.SQRT2).toBeLessThan(0.005);
    }
  });
});

describe("포스터 비율을 모델 값으로", () => {
  const gpt = modelById("gpt-image-2");
  const nano = modelById("nano-banana-pro");

  it("A4 시안은 nano 에서 3:4 로 간다 — 최근접 계산에 맡기지 않는다", () => {
    // 3:4(1.333) 거리 0.081 vs 2:3(1.5) 거리 0.086. 6% 차이라 규칙으로 못 박는다.
    expect(resolvePosterSize("a4-draft", nano)).toMatchObject({ mode: "enum", aspectRatio: "3:4" });
  });

  it("A4 인쇄용은 nano 가 못 만든다 — 이유를 준다", () => {
    expect(resolvePosterSize("a4-print", nano).rejected).toMatch(/인쇄/);
  });

  it("A4 인쇄용은 GPT 에서 픽셀로 간다", () => {
    expect(resolvePosterSize("a4-print", gpt)).toMatchObject({
      mode: "pixel",
      pixel: { width: 2400, height: 3392 },
    });
  });

  it("포스터 세로 2:3 은 양쪽 다 된다", () => {
    expect(resolvePosterSize("2:3", gpt).pixel).toEqual({ width: 1024, height: 1536 });
    expect(resolvePosterSize("2:3", nano).aspectRatio).toBe("2:3");
  });

  it("카드뉴스 resolveSize 는 포스터 비율을 모른다", () => {
    expect(resolveSize("a4-print", gpt).rejected).toMatch(/모르는 비율/);
  });
});
