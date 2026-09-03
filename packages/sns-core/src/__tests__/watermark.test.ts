import { describe, expect, it } from "vitest";
import { badgePlacement, isBrightCorner } from "../watermark";

describe("표기를 어디에 얼마나 크게", () => {
  it("오른쪽 아래에 놓는다", () => {
    const place = badgePlacement({ width: 1000, height: 1000 }, { width: 422, height: 94 });
    expect(place.left + place.width).toBeLessThan(1000);
    expect(place.top + place.height).toBeLessThan(1000);
    // 가운데보다 오른쪽 아래여야 한다.
    expect(place.left).toBeGreaterThan(500);
    expect(place.top).toBeGreaterThan(500);
  });

  it("그림이 커지면 표기도 같이 커진다", () => {
    // 고정 크기로 두면 작은 그림에서는 큼직하고 큰 그림에서는 안 보인다.
    const small = badgePlacement({ width: 1000, height: 1000 }, { width: 422, height: 94 });
    const large = badgePlacement({ width: 3000, height: 3000 }, { width: 422, height: 94 });
    expect(large.width).toBeGreaterThan(small.width);
  });

  it("원래 글자 비율을 거의 지킨다", () => {
    // 정수 픽셀로 떨어뜨리는 이상 조금은 어긋난다. 100픽셀짜리 표기에서
    // 2% 는 눈에 안 띈다 — 여기서 요구하는 것은 "찌그러져 보이지 않을 것"이다.
    const target = 422 / 94;
    for (const canvas of [{ width: 1600, height: 900 }, { width: 1088, height: 1360 }, { width: 3840, height: 2160 }]) {
      const place = badgePlacement(canvas, { width: 422, height: 94 });
      expect(Math.abs(place.width / place.height - target) / target).toBeLessThan(0.02);
    }
  });

  it("아주 작은 그림에서도 밖으로 안 나간다", () => {
    const place = badgePlacement({ width: 200, height: 120 }, { width: 422, height: 94 });
    expect(place.left).toBeGreaterThanOrEqual(0);
    expect(place.top).toBeGreaterThanOrEqual(0);
    expect(place.left + place.width).toBeLessThanOrEqual(200);
    expect(place.top + place.height).toBeLessThanOrEqual(120);
  });

  it("긴 가로 그림에서도 안 넘친다", () => {
    const place = badgePlacement({ width: 2048, height: 300 }, { width: 422, height: 94 });
    expect(place.top + place.height).toBeLessThanOrEqual(300);
  });
});

describe("바탕이 밝은지 어두운지", () => {
  it("흰 바탕은 밝다", () => {
    expect(isBrightCorner([250, 250, 250, 240, 245, 255])).toBe(true);
  });

  it("검은 바탕은 어둡다", () => {
    expect(isBrightCorner([10, 12, 8, 20, 5, 15])).toBe(false);
  });

  it("아무 값도 없으면 어두운 쪽으로 본다", () => {
    // 흰 글자가 기본이다. 못 재면 원래대로 둔다.
    expect(isBrightCorner([])).toBe(false);
  });
});
