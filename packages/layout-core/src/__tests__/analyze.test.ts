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

  /**
   * 실측(2026-09-03): 카드 한 장을 보내면 Claude 가 칸 목록을 **JSON 문자열로
   * 감싸서** 돌려준다. `{"slots": "{\"slots\":[...]}"}` 모양이다.
   * 이걸 못 풀면 멀쩡히 읽어낸 칸을 통째로 버리고 「못 읽었다」고 말한다.
   */
  it("칸 목록을 문자열로 감싸 보내도 되살린다", () => {
    const inner = JSON.stringify({ slots: [box(), box({ kind: "text", textRole: "body" })] });
    const result = normalizeAnalysis({ slots: inner });

    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]!.kind).toBe("image");
  });

  it("배열만 문자열로 감싸 보내도 되살린다", () => {
    const result = normalizeAnalysis({ slots: JSON.stringify([box()]) });

    expect(result.slots).toHaveLength(1);
  });

  it("응답 전체가 문자열이어도 되살린다", () => {
    const result = normalizeAnalysis(JSON.stringify({ slots: [box()] }));

    expect(result.slots).toHaveLength(1);
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

  it("실제 카드만큼 많은 칸도 그대로 담는다", () => {
    // 실측: 매장 홍보 카드 한 장에서 12칸이 나온다. 여덟에서 자르면 전화번호나
    // 주소 같은 것이 소리 없이 사라진다.
    const twelve = Array.from({ length: 12 }, (_unused, offset) => box({ y: offset * 0.08, height: 0.07 }));

    expect(normalizeAnalysis({ slots: twelve }).slots).toHaveLength(12);
    expect(normalizeAnalysis({ slots: twelve }).issues).toEqual([]);
  });

  it("상한을 넘으면 큰 것부터 남기고 쌓는 순서는 그대로 둔다", () => {
    const many = Array.from({ length: MAX_ANALYZED_SLOTS + 1 }, (_unused, offset) => box({
      x: 0,
      y: 0,
      // 뒤로 갈수록 작다. 가장 작은 첫 칸이 잘려 나가야 한다.
      width: 0.9 - offset * 0.02,
      height: 0.9,
    })).reverse();

    const result = normalizeAnalysis({ slots: many });
    const widths = result.slots.map((slot) => slot.box.width);

    expect(result.slots).toHaveLength(MAX_ANALYZED_SLOTS);
    // 큰 것부터 남기되 쌓는 순서는 그대로다 — 넓이가 커지는 차례로 남아야 한다.
    expect(widths).toEqual([...widths].sort((first, second) => first - second));
    expect(result.issues).toHaveLength(1);
  });

  it("글 칸은 읽어낸 역할을 카피 칸에 잇는다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", textRole: "body" })] });

    expect(result.slots[0]).toMatchObject({ kind: "text", source: { from: "copy", field: "body" } });
  });

  it("역할을 못 읽은 글 칸은 헤드라인으로 둔다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text" })] });

    expect(result.slots[0]).toMatchObject({ source: { from: "copy", field: "headline" } });
  });

  /**
   * 위치만 읽고 디자인을 버리면, 흰 글씨 카드가 검은 글씨로 나온다.
   * 「레퍼런스처럼」이 이 기능의 전부이므로 색·정렬·굵기·크기를 다 읽는다.
   */
  it("글자 색을 읽어낸다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", color: "#ffffff" })] });

    expect(result.slots[0]).toMatchObject({ style: { color: "#FFFFFF" } });
  });

  it("가운데 정렬을 읽어낸다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", align: "center" })] });

    expect(result.slots[0]).toMatchObject({ style: { align: "center" } });
  });

  it("굵기를 읽어낸다", () => {
    const bold = normalizeAnalysis({ slots: [box({ kind: "text", textRole: "body", weight: "bold" })] });
    const plain = normalizeAnalysis({ slots: [box({ kind: "text", textRole: "headline", weight: "regular" })] });

    expect(bold.slots[0]).toMatchObject({ style: { weight: 700 } });
    expect(plain.slots[0]).toMatchObject({ style: { weight: 400 } });
  });

  it("글자가 칸을 채우는 정도를 읽어 크기로 쓴다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", fillRatio: 0.8 })] });

    expect(result.slots[0]).toMatchObject({ style: { sizeRatio: 0.8 } });
  });

  it("못 읽은 값은 읽기 좋은 기본으로 둔다", () => {
    const result = normalizeAnalysis({ slots: [box({ kind: "text", textRole: "headline" })] });

    expect(result.slots[0]).toMatchObject({ style: { color: "#111111", align: "left", weight: 700 } });
  });

  it("말이 안 되는 값은 버리고 기본으로 둔다", () => {
    const result = normalizeAnalysis({
      slots: [box({ kind: "text", color: "연두색", align: "가운데", weight: "아주굵게", fillRatio: 99 })],
    });

    expect(result.slots[0]).toMatchObject({ style: { color: "#111111", align: "left" } });
    expect((result.slots[0] as { style: { sizeRatio: number } }).style.sizeRatio).toBeLessThanOrEqual(2);
  });

  /**
   * 레퍼런스에는 글 자리가 일곱인데 원고는 넉 칸(제목·본문·강조·작은글씨)뿐이다.
   * 그대로 이으면 같은 문장이 네 번 반복된다 — 실제로 그랬다.
   *
   * **한 칸에 한 번씩만 잇고, 남는 자리는 레퍼런스에 써 있던 글을 그대로 둔다.**
   * 「오시는 길」 같은 라벨은 원래 고정이고, 주소·전화번호는 사람이 자기 것으로
   * 고치면 된다. 이게 「고정할 부분은 고정」이다.
   */
  it("같은 자리를 두 번 이으면 두 번째는 읽어낸 글을 그대로 둔다", () => {
    const result = normalizeAnalysis({ slots: [
      box({ kind: "text", textRole: "headline", text: "미리레저에서" }),
      box({ kind: "text", textRole: "headline", text: "직접 확인하세요!" }),
    ] });

    expect(result.slots[0]).toMatchObject({ source: { from: "copy", field: "headline" } });
    expect(result.slots[1]).toMatchObject({ source: { from: "fixed", text: "직접 확인하세요!" } });
  });

  it("읽어낸 글이 없으면 원고 자리로 두고 채워지길 기다린다", () => {
    const result = normalizeAnalysis({ slots: [
      box({ kind: "text", textRole: "body" }),
      box({ kind: "text", textRole: "body" }),
    ] });

    expect(result.slots[0]).toMatchObject({ source: { from: "copy", field: "body" } });
    expect(result.slots[1]).toMatchObject({ source: { from: "copy", field: "body" } });
  });

  it("자리가 다르면 저마다 원고에 잇는다", () => {
    const result = normalizeAnalysis({ slots: [
      box({ kind: "text", textRole: "headline", text: "제목" }),
      box({ kind: "text", textRole: "body", text: "본문" }),
    ] });

    expect(result.slots[0]).toMatchObject({ source: { from: "copy", field: "headline" } });
    expect(result.slots[1]).toMatchObject({ source: { from: "copy", field: "body" } });
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
