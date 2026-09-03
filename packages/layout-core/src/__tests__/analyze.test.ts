import { describe, expect, it } from "vitest";
import { MAX_ANALYZED_SLOTS, normalizeAnalysis } from "../analyze";

function box(patch: Record<string, unknown> = {}) {
  return { kind: "image", x: 0.1, y: 0.1, width: 0.3, height: 0.3, ...patch };
}

describe("normalizeAnalysis", () => {
  it("읽어낸 칸을 그대로 뼈대 칸으로 옮긴다", () => {
    const result = normalizeAnalysis({ slots: [box()] });

    expect(result.issues).toEqual([]);
    expect(result.slots).toEqual([{ kind: "image", box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 } }]);
  });

  it("0~1 밖으로 나간 칸은 카드 안으로 잘라 맞춘다", () => {
    const result = normalizeAnalysis({ slots: [box({ x: -0.2, y: 0.8, width: 0.5, height: 0.5 })] });

    expect(result.slots[0]!.box).toEqual({ x: 0, y: 0.8, width: 0.3, height: 0.2 });
  });

  it("넓이나 높이가 0인 칸은 버린다", () => {
    const result = normalizeAnalysis({ slots: [box({ width: 0 }), box({ height: -1 }), box()] });

    expect(result.slots).toHaveLength(1);
  });

  it("칸을 하나도 못 읽으면 직접 고르라고 알린다", () => {
    const result = normalizeAnalysis({ slots: [] });

    expect(result.slots).toEqual([]);
    expect(result.issues.join(" ")).toContain("직접");
  });

  it("응답이 딴 모양이면 안내를 남기고 빈 뼈대를 돌려준다", () => {
    const result = normalizeAnalysis("칸을 못 찾았습니다");

    expect(result.slots).toEqual([]);
    expect(result.issues).toHaveLength(1);
  });

  it("모르는 종류의 칸은 버린다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "qrcode" }), box()] });

    expect(result.slots).toHaveLength(1);
  });

  it("여덟 칸을 넘으면 큰 것부터 남기고 쌓는 순서는 그대로 둔다", () => {
    const many = Array.from({ length: 9 }, (_unused, offset) => box({
      x: 0,
      y: 0,
      // 뒤로 갈수록 작다. 가장 작은 첫 칸이 잘려 나가야 한다.
      width: 0.9 - offset * 0.05,
      height: 0.9,
      brief: `${offset}`,
    })).reverse();

    const result = normalizeAnalysis({ slots: many });

    expect(result.slots).toHaveLength(MAX_ANALYZED_SLOTS);
    expect(result.slots.map((slot) => (slot.kind === "image" ? slot.brief : undefined)))
      .toEqual(["7", "6", "5", "4", "3", "2", "1", "0"]);
    expect(result.issues.join(" ")).toContain("여덟");
  });

  it("글 칸은 읽어낸 역할을 카피 칸에 잇는다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", textRole: "body" })] });

    expect(result.slots[0]).toMatchObject({ kind: "text", source: { from: "copy", field: "body" } });
  });

  it("역할을 못 읽은 글 칸은 헤드라인으로 둔다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text" })] });

    expect(result.slots[0]).toMatchObject({ source: { from: "copy", field: "headline" } });
  });

  it("배경 색이 hex 가 아니면 흰색으로 둔다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "background", fill: "연한 하늘색" })] });

    expect(result.slots[0]).toMatchObject({ kind: "background", fill: "#FFFFFF" });
  });

  it("배경 색이 hex 면 그대로 쓴다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "background", fill: "#0f172a" })] });

    expect(result.slots[0]).toMatchObject({ fill: "#0F172A" });
  });

  it("로고 칸은 그림을 아직 고르지 않은 채로 온다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "logo" })] });

    expect(result.slots[0]).toEqual({
      kind: "logo",
      box: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
      referenceImageId: "",
      fit: "contain",
    });
    expect(result.issues.join(" ")).toContain("로고");
  });
});
