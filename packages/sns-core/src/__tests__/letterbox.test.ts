import { describe, expect, it } from "vitest";
import { averageEdgeColor, letterboxPlan } from "../letterbox";

describe("여백 계산", () => {
  it("가로가 넓으면 위아래에 여백", () => {
    const plan = letterboxPlan({ width: 1600, height: 900 }, { width: 1088, height: 1360 });
    expect(plan.drawWidth).toBe(1088);
    expect(plan.drawHeight).toBe(612);
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(374);
  });

  it("세로가 길면 좌우에 여백", () => {
    const plan = letterboxPlan({ width: 900, height: 1600 }, { width: 1088, height: 1088 });
    expect(plan.drawHeight).toBe(1088);
    expect(plan.drawWidth).toBe(612);
    expect(plan.offsetY).toBe(0);
    expect(plan.offsetX).toBe(238);
  });

  it("비율이 같으면 여백이 없다", () => {
    const plan = letterboxPlan({ width: 544, height: 680 }, { width: 1088, height: 1360 });
    expect(plan.offsetX).toBe(0);
    expect(plan.offsetY).toBe(0);
    expect(plan.drawWidth).toBe(1088);
  });

  it("잘라내지 않는다 — 그린 영역이 항상 규격 안에 들어간다", () => {
    for (const source of [{ width: 4000, height: 100 }, { width: 100, height: 4000 }]) {
      const plan = letterboxPlan(source, { width: 1088, height: 1360 });
      expect(plan.drawWidth).toBeLessThanOrEqual(1088);
      expect(plan.drawHeight).toBeLessThanOrEqual(1360);
      expect(plan.offsetX).toBeGreaterThanOrEqual(0);
      expect(plan.offsetY).toBeGreaterThanOrEqual(0);
    }
  });

  it("원본 가로세로비를 유지한다", () => {
    for (const source of [
      { width: 1600, height: 900 },
      { width: 900, height: 1600 },
      { width: 544, height: 680 },
    ]) {
      const plan = letterboxPlan(source, { width: 1088, height: 1360 });
      expect(plan.drawWidth / plan.drawHeight).toBeCloseTo(source.width / source.height, 2);
    }
  });

  it("AI 와 검수를 거치지 않는 배치 계획이다", () => {
    const plan = letterboxPlan({ width: 1600, height: 900 }, { width: 1088, height: 1360 });
    expect(plan.usesAi).toBe(false);
    expect(plan.reviewRequired).toBe(false);
    expect(plan.fillStrategy).toBe("edge_average");
  });
});

describe("여백 색", () => {
  it("원본 가장자리 RGB 표본의 평균색을 쓴다", () => {
    expect(averageEdgeColor([
      { r: 240, g: 230, b: 220 },
      { r: 200, g: 190, b: 180 },
    ])).toBe("#dcd2c8");
  });

  it("가장자리 표본이 없으면 색을 지어내지 않는다", () => {
    expect(() => averageEdgeColor([])).toThrow("가장자리 색상 표본이 없습니다");
  });
});
