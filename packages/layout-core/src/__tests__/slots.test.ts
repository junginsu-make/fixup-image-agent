import { describe, expect, it } from "vitest";
import { reorderSlot, slotRect } from "../slots";
import type { LayoutSlot } from "../slots";

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

  /**
   * 칸을 나눠 붙였을 때 사이에 1픽셀 틈이 생기거나 1픽셀 겹치면, 배경이
   * 비쳐 실선처럼 보인다. 세로 하나만 보고 넘기면 가로에서 깨져도 모른다.
   */
  it("어느 비율에서 어디를 잘라도 두 칸이 딱 맞붙는다", () => {
    const cards = [
      { width: 1088, height: 1360 }, { width: 1088, height: 1088 },
      { width: 1152, height: 2048 }, { width: 2048, height: 1152 },
    ];
    const broken: string[] = [];

    for (const card of cards) {
      for (let step = 1; step < 1000; step += 1) {
        const cut = step / 1000;
        const top = slotRect({ x: 0, y: 0, width: 1, height: cut }, card);
        const bottom = slotRect({ x: 0, y: cut, width: 1, height: 1 - cut }, card);
        if (top.top + top.height !== bottom.top) broken.push(`${card.height} 세로 ${cut}`);

        const left = slotRect({ x: 0, y: 0, width: cut, height: 1 }, card);
        const right = slotRect({ x: cut, y: 0, width: 1 - cut, height: 1 }, card);
        if (left.left + left.width !== right.left) broken.push(`${card.width} 가로 ${cut}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it("셋으로 나눠도 사이가 벌어지지 않고 끝이 카드 끝에 닿는다", () => {
    const card = { width: 1088, height: 1360 };
    const cuts = [0.33, 0.7];
    const parts = [
      slotRect({ x: 0, y: 0, width: 1, height: cuts[0]! }, card),
      slotRect({ x: 0, y: cuts[0]!, width: 1, height: cuts[1]! - cuts[0]! }, card),
      slotRect({ x: 0, y: cuts[1]!, width: 1, height: 1 - cuts[1]! }, card),
    ];

    expect(parts[0]!.top + parts[0]!.height).toBe(parts[1]!.top);
    expect(parts[1]!.top + parts[1]!.height).toBe(parts[2]!.top);
    expect(parts[2]!.top + parts[2]!.height).toBe(card.height);
  });

  it("숫자가 아닌 값이 와도 카드 안의 칸을 준다", () => {
    const rect = slotRect({ x: Number.NaN, y: Number.NaN, width: 0.5, height: 0.5 }, { width: 100, height: 100 });

    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.left + rect.width).toBeLessThanOrEqual(100);
    expect(rect.top + rect.height).toBeLessThanOrEqual(100);
  });

  it("너무 작아 사라질 칸도 최소 1픽셀은 남긴다", () => {
    const rect = slotRect({ x: 0.5, y: 0.5, width: 0.0001, height: 0.0001 }, CARD);

    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });
});

describe("reorderSlot", () => {
  const boxes = (n: number): LayoutSlot[] =>
    Array.from({ length: n }, (_u, i): LayoutSlot => ({ kind: "image", box: { x: 0, y: 0, width: 1, height: 1 }, brief: `${i}` }));
  const briefs = (list: LayoutSlot[]) => list.map((s) => (s.kind === "image" ? s.brief : ""));

  it("아래 것을 위로 끌어 올린다", () => {
    expect(briefs(reorderSlot(boxes(4), 0, 2))).toEqual(["1", "2", "0", "3"]);
  });

  it("위 것을 아래로 끌어 내린다", () => {
    expect(briefs(reorderSlot(boxes(4), 3, 1))).toEqual(["0", "3", "1", "2"]);
  });

  it("제자리에 놓으면 그대로다", () => {
    expect(briefs(reorderSlot(boxes(3), 1, 1))).toEqual(["0", "1", "2"]);
  });

  it("범위 밖이면 그대로 둔다", () => {
    const before = boxes(3);
    expect(reorderSlot(before, 0, 9)).toBe(before);
    expect(reorderSlot(before, -1, 1)).toBe(before);
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const before = boxes(3);
    reorderSlot(before, 0, 2);
    expect(briefs(before)).toEqual(["0", "1", "2"]);
  });
});
