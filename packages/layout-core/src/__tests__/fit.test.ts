import { describe, expect, it } from "vitest";
import { FIT_MIN_SCALE, fitFontSize, targetFontSize } from "../fit";

const BOX = { width: 400, height: 200 };

/** 글자 크기에 정비례해 자라는 가짜 글. 폰트 없이 줄이기 규칙만 본다. */
function measureBy(widthPerPx: number, heightPerPx: number) {
  return (fontPx: number) => ({ width: fontPx * widthPerPx, height: fontPx * heightPerPx });
}

describe("targetFontSize", () => {
  it("목표 크기는 칸 높이 곱하기 비율이다", () => {
    expect(targetFontSize({ width: 400, height: 200 }, 0.25)).toBe(50);
  });

  it("비율이 0 이하여도 1픽셀 밑으로는 안 내려간다", () => {
    expect(targetFontSize({ width: 400, height: 200 }, 0)).toBe(1);
  });
});

describe("fitFontSize", () => {
  it("칸에 들어가는 글은 목표 크기 그대로 쓴다", async () => {
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: measureBy(2, 2) });

    expect(result.fontPx).toBe(50);
    expect(result.overflow).toBe(false);
  });

  it("넘치는 글은 들어갈 때까지만 줄인다", async () => {
    // 높이가 크기의 4.3배 — 200픽셀 칸에는 46.5픽셀 이하여야 들어간다.
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: measureBy(2, 4.3) });

    expect(result.fontPx).toBe(45);
    expect(result.overflow).toBe(false);
  });

  it("가로로 넘쳐도 줄인다", async () => {
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: measureBy(8.5, 1) });

    expect(result.fontPx).toBe(45);
    expect(result.overflow).toBe(false);
  });

  it("60%까지 줄여도 넘치면 거기서 멈추고 넘쳤다고 알린다", async () => {
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: measureBy(2, 100) });

    expect(result.fontPx).toBe(50 * FIT_MIN_SCALE);
    expect(result.overflow).toBe(true);
  });

  it("한 번에 맞으면 재 보는 일도 한 번뿐이다", async () => {
    let calls = 0;
    await fitFontSize({
      targetPx: 50,
      box: BOX,
      measure: (fontPx: number) => { calls += 1; return { width: fontPx, height: fontPx }; },
    });

    expect(calls).toBe(1);
  });

});
