import { describe, expect, it } from "vitest";
import { MAX_CANVAS_SIDE, stitchLayout } from "../stitch-layout";

/**
 * **이어보기를 한 장으로 내려받는다**(2026-09-23 사용자).
 *
 * 섹션마다 따로 받는 것은 됐는데, 이어보기처럼 위아래로 붙인 긴 한 장은
 * 받을 길이 없었다. 상세페이지는 결국 그 긴 한 장으로 올라간다.
 */
describe("이어 붙이기 배치", () => {
  it("폭을 가장 넓은 장에 맞추고 위에서 아래로 쌓는다", () => {
    const layout = stitchLayout([
      { width: 1000, height: 1500 },
      { width: 500, height: 500 },
    ]);
    expect(layout.width).toBe(1000);
    // 좁은 장은 폭에 맞춰 늘린다. 비율은 그대로다.
    expect(layout.rows).toEqual([
      { y: 0, height: 1500 },
      { y: 1500, height: 1000 },
    ]);
    expect(layout.height).toBe(2500);
  });

  it("**캔버스 한계보다 길면 통째로 줄인다** — 넘으면 브라우저가 빈 그림을 준다", () => {
    const tall = Array.from({ length: 12 }, () => ({ width: 1536, height: 2752 }));
    const layout = stitchLayout(tall);
    expect(layout.height).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(layout.width).toBeLessThan(1536);
    // 이음매에 틈이 없어야 실제 상세페이지와 같다.
    layout.rows.forEach((row, index) => {
      if (index > 0) expect(row.y).toBe(layout.rows[index - 1].y + layout.rows[index - 1].height);
    });
    expect(layout.rows.at(-1)!.y + layout.rows.at(-1)!.height).toBe(layout.height);
  });

  it("한계 안이면 줄이지 않는다 — 화질을 깎지 않는다", () => {
    const layout = stitchLayout(Array.from({ length: 9 }, () => ({ width: 1536, height: 2752 })));
    expect(layout.width).toBe(1536);
    expect(layout.height).toBe(9 * 2752);
  });

  /*
    **아이폰은 캔버스 넓이 한도가 약 1,670만 픽셀이다**(독립 리뷰 MEDIUM).
    한 변 상한만 지키면 넓이를 넘어 오류 없이 빈 그림이 나온다.
  */
  it("**넓이 한도를 주면 그 안으로 줄인다**", () => {
    const sizes = Array.from({ length: 9 }, () => ({ width: 1536, height: 2752 }));
    const layout = stitchLayout(sizes, { maxArea: 16_000_000 });
    expect(layout.width * layout.height).toBeLessThanOrEqual(16_000_000);
    expect(layout.rows.at(-1)!.y + layout.rows.at(-1)!.height).toBe(layout.height);
  });

  it("빈 목록이면 빈 배치다", () => {
    expect(stitchLayout([])).toEqual({ width: 0, height: 0, rows: [] });
  });
});
