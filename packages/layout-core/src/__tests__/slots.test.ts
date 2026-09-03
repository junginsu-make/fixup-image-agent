import { describe, expect, it } from "vitest";
import { slotRect } from "../slots";

const CARD = { width: 1088, height: 1360 };

describe("slotRect", () => {
  it("카드를 꽉 채우는 칸은 카드 크기 그대로다", () => {
    expect(slotRect({ x: 0, y: 0, width: 1, height: 1 }, CARD))
      .toEqual({ left: 0, top: 0, width: 1088, height: 1360 });
  });

  it("위아래로 나눈 두 칸은 겹치지도 벌어지지도 않는다", () => {
    const top = slotRect({ x: 0, y: 0, width: 1, height: 0.37 }, CARD);
    const bottom = slotRect({ x: 0, y: 0.37, width: 1, height: 0.63 }, CARD);

    expect(top.top + top.height).toBe(bottom.top);
    expect(bottom.top + bottom.height).toBe(CARD.height);
  });

  it("카드 밖으로 나간 칸은 카드 안으로 잘린다", () => {
    const rect = slotRect({ x: 0.9, y: 0.9, width: 0.3, height: 0.3 }, CARD);

    expect(rect.left + rect.width).toBe(CARD.width);
    expect(rect.top + rect.height).toBe(CARD.height);
  });

  it("음수 좌표는 잘라내고 카드 안에 남은 만큼만 쓴다", () => {
    expect(slotRect({ x: -0.5, y: -0.5, width: 1, height: 1 }, CARD))
      .toEqual({ left: 0, top: 0, width: 544, height: 680 });
  });

  it("너무 작아 사라질 칸도 최소 1픽셀은 남긴다", () => {
    const rect = slotRect({ x: 0.5, y: 0.5, width: 0.0001, height: 0.0001 }, CARD);

    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });
});
