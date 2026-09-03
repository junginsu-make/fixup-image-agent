import { describe, expect, it } from "vitest";
import { FIT_MIN_SCALE, fitFontSize, targetFontSize } from "../fit";

const BOX = { width: 400, height: 200 };

/** 글자 크기에 정비례해 자라는 가짜 글. 폰트 없이 줄이기 규칙만 본다. */
function measureBy(widthPerPx: number, heightPerPx: number) {
  return (fontPx: number) => ({ width: fontPx * widthPerPx, height: fontPx * heightPerPx });
}

/** 재 본 횟수를 센다. 재는 일 한 번이 렌더 한 번이다. */
function counting(measure: (fontPx: number) => { width: number; height: number }) {
  const state = { calls: 0, measure: (fontPx: number) => { state.calls += 1; return measure(fontPx); } };
  return state;
}

/** 하나씩 줄여 찾았을 때의 답. 반씩 갈라 찾아도 같아야 한다. */
function linearAnswer(heightPerPx: number): number {
  for (let step = 0; step <= 8; step += 1) {
    const size = Math.round(50 * ((100 - step * 5) / 100) * 100) / 100;
    if (size * 2 <= BOX.width && size * heightPerPx <= BOX.height) return size;
  }
  return Math.round(50 * FIT_MIN_SCALE * 100) / 100;
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
    const counted = counting(measureBy(1, 1));
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: counted.measure });

    expect(counted.calls).toBe(1);
    expect(result.measured).toBe(1);
  });

  // 재는 일은 렌더 한 번이다. 안 들어갈 글에 열 번 그리면 그 요청 하나로
  // 서버가 몇 초씩 묶인다 — 글 칸 열여섯이면 그 곱만큼이다.
  // 실제로 재는 일(sharp)은 비동기다. 동기 함수로만 시험하면 그 갈래를 한 번도 안 탄다.
  it("재는 일이 비동기여도 같은 답을 낸다", async () => {
    const result = await fitFontSize({
      targetPx: 50,
      box: BOX,
      measure: async (fontPx: number) => {
        await Promise.resolve();
        return { width: fontPx * 2, height: fontPx * 4.3 };
      },
    });

    expect(result.fontPx).toBe(45);
    expect(result.overflow).toBe(false);
  });

  it("칸이 없다시피 해도 하한에서 멈추고 무한히 줄이지 않는다", async () => {
    const counted = counting(measureBy(1, 1));
    const result = await fitFontSize({ targetPx: 50, box: { width: 0, height: 0 }, measure: counted.measure });

    expect(result.overflow).toBe(true);
    expect(counted.calls).toBe(2);
  });

  it("아무리 줄여도 안 들어가면 두 번만 재 보고 끝낸다", async () => {
    const counted = counting(measureBy(2, 100));
    const result = await fitFontSize({ targetPx: 50, box: BOX, measure: counted.measure });

    expect(counted.calls).toBe(2);
    expect(result.overflow).toBe(true);
  });

  it("줄여서 맞는 경우에도 다섯 번을 넘기지 않는다", async () => {
    for (const height of [4.3, 4.05, 5, 6, 6.6]) {
      const counted = counting(measureBy(2, height));
      const result = await fitFontSize({ targetPx: 50, box: BOX, measure: counted.measure });

      expect(counted.calls).toBeLessThanOrEqual(5);
      // 반씩 갈라 찾아도 하나씩 줄여 찾은 것과 같은 크기가 나와야 한다.
      expect(result.fontPx).toBe(linearAnswer(height));
    }
  });

});
