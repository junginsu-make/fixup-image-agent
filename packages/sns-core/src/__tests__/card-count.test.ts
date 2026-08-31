import { describe, expect, it } from "vitest";
import { validatePlaceAsIsCapacity } from "../attachments";
import { DEFAULT_CARD_COUNT, layoutCards, planSlots } from "../card-count";

describe("자리 계산", () => {
  it("기본값은 AI 추천이다", () => {
    expect(DEFAULT_CARD_COUNT).toBe("auto");
    expect(planSlots({ placeAsIsCount: 0, hasEndingImage: false }).total).toBe("auto");
  });

  it("고른 장수에서 예약분을 빼고 남은 자리를 AI 에게 준다", () => {
    // 6장 = 표지 1 + 원본 2 + AI 속지 2 + 마지막 1
    const plan = planSlots({ requested: 6, placeAsIsCount: 2, hasEndingImage: true });
    expect(plan).toMatchObject({ total: 6, cover: 1, placeAsIs: 2, aiBody: 2, ending: 1 });
    expect(plan.issues).toEqual([]);
  });

  it("마지막 장 이미지가 없어도 마지막 자리는 있다", () => {
    // 없으면 AI 가 요약 마무리 페이지를 만든다. 자리는 그대로 차지한다.
    const plan = planSlots({ requested: 5, placeAsIsCount: 0, hasEndingImage: false });
    expect(plan).toMatchObject({ total: 5, cover: 1, placeAsIs: 0, aiBody: 3, ending: 1 });
  });

  it("예약분이 고른 장수를 넘으면 공용 자리 부족 검사로 막는다", () => {
    const plan = planSlots({ requested: 6, placeAsIsCount: 5, hasEndingImage: true });
    expect(plan.issues).toEqual(validatePlaceAsIsCapacity(5, 6));
    expect(plan.aiBody).toBe(0);
  });

  it("자리가 딱 맞으면 AI 자리가 0 이어도 통과한다", () => {
    const plan = planSlots({ requested: 6, placeAsIsCount: 4, hasEndingImage: true });
    expect(plan.aiBody).toBe(0);
    expect(plan.issues).toEqual([]);
  });

  it("AI 추천이면 예약분을 뺀 뒤 가능한 장수 범위를 준다", () => {
    const plan = planSlots({ requested: "auto", placeAsIsCount: 2, hasEndingImage: true });
    expect(plan.total).toBe("auto");
    expect(plan.placeAsIs).toBe(2);
    // 최소 = 표지 1 + 원본 2 + 마지막 1 = 4, 최대 8
    expect(plan.autoRange).toEqual({ min: 4, max: 8 });
  });

  it("AI 추천도 최대 장수에 원본이 다 안 들어가면 막는다", () => {
    const plan = planSlots({ requested: "auto", placeAsIsCount: 7, hasEndingImage: true });
    expect(plan.issues).toEqual(validatePlaceAsIsCapacity(7, 8));
  });

  it("고를 수 있는 장수는 4~8 이다", () => {
    expect(planSlots({ requested: 3, placeAsIsCount: 0, hasEndingImage: false }).issues[0]).toContain("4~8");
    expect(planSlots({ requested: 9, placeAsIsCount: 0, hasEndingImage: false }).issues[0]).toContain("4~8");
  });
});

describe("원본 장의 자리 배정", () => {
  it("자리를 안 정하면 앞에서부터 채운다", () => {
    const layout = layoutCards({ total: 6, placeAsIs: [{ id: "p1" }, { id: "p2" }], hasEndingImage: true });
    expect(layout.map((slot) => slot.kind)).toEqual([
      "cover", "place_as_is", "place_as_is", "generated", "generated", "ending_image",
    ]);
    expect(layout.slice(1, 3).map((slot) => slot.attachmentId)).toEqual(["p1", "p2"]);
  });

  it("자리를 정하면 그 카드 번호에 넣는다", () => {
    const layout = layoutCards({
      total: 6,
      placeAsIs: [{ id: "p1", bodySlot: 2 }, { id: "p2", bodySlot: 4 }],
      hasEndingImage: true,
    });
    expect(layout.map((slot) => slot.kind)).toEqual([
      "cover", "place_as_is", "generated", "place_as_is", "generated", "ending_image",
    ]);
    expect(layout[1]!.attachmentId).toBe("p1");
    expect(layout[3]!.attachmentId).toBe("p2");
  });

  it("미지정 원본은 지정하고 남은 앞자리부터 채운다", () => {
    const layout = layoutCards({
      total: 6,
      placeAsIs: [{ id: "fixed", bodySlot: 4 }, { id: "first" }, { id: "second" }],
      hasEndingImage: true,
    });
    expect(layout[1]!.attachmentId).toBe("first");
    expect(layout[2]!.attachmentId).toBe("second");
    expect(layout[3]!.attachmentId).toBe("fixed");
  });

  it("자리가 겹치면 알린다", () => {
    const layout = layoutCards({
      total: 6, placeAsIs: [{ id: "p1", bodySlot: 2 }, { id: "p2", bodySlot: 2 }], hasEndingImage: true,
    });
    expect(layout.issues.join("\n")).toContain("겹칩니다");
  });

  it("속지 구간을 벗어난 자리는 알린다", () => {
    const layout = layoutCards({
      total: 6, placeAsIs: [{ id: "p1", bodySlot: 6 }], hasEndingImage: true,
    });
    expect(layout.issues.join("\n")).toContain("2~5");
  });

  it("마지막 장 이미지가 없으면 그 자리는 generated 다", () => {
    const layout = layoutCards({ total: 5, placeAsIs: [], hasEndingImage: false });
    expect(layout[4]!.kind).toBe("generated");
    expect(layout[4]!.role).toBe("ending");
  });
});
