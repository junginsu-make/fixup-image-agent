import { describe, expect, it } from "vitest";
import { describeZoom, fitScale } from "../image-viewer-scale";

describe("화면에 맞추는 배율", () => {
  it("화면보다 작은 그림은 늘리지 않는다", () => {
    // 512짜리를 1920 화면에 억지로 키우면 뭉개진 그림을 자세히 본다고 착각한다.
    expect(fitScale({ width: 512, height: 512 }, { width: 1920, height: 1080 })).toBe(1);
  });

  it("화면보다 큰 그림은 다 들어오게 줄인다", () => {
    expect(fitScale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5);
    expect(fitScale({ width: 1000, height: 2000 }, { width: 1000, height: 1000 })).toBe(0.5);
  });

  it("가로·세로 중 더 많이 줄여야 하는 쪽을 따른다", () => {
    expect(fitScale({ width: 4000, height: 1000 }, { width: 1000, height: 900 })).toBe(0.25);
  });

  it("크기를 아직 모르면 1로 둔다", () => {
    expect(fitScale(null, { width: 1000, height: 1000 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, { width: 1000, height: 1000 })).toBe(1);
  });
});

describe("지금 몇 배로 보고 있는지", () => {
  it("원본 크기와 배율을 함께 알려 준다", () => {
    expect(describeZoom({ width: 2048, height: 1024 }, 0.5)).toBe("2048 × 1024 · 50%");
    expect(describeZoom({ width: 1024, height: 1024 }, 1)).toBe("1024 × 1024 · 원본 크기");
  });

  it("크기를 모르면 크기 자리를 비운다", () => {
    expect(describeZoom(null, 1)).toBe("원본 크기");
  });

  it("배율은 반올림해서 보여 준다", () => {
    expect(describeZoom({ width: 3000, height: 1000 }, 0.333)).toBe("3000 × 1000 · 33%");
  });
});
