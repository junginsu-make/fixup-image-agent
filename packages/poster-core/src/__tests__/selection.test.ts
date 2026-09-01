import { describe, expect, it } from "vitest";
import { planSelection, planEditJob, canEdit } from "../selection";
import { EMPTY_SLOTS } from "../schemas";

const images = [
  { id: "i1", variantIndex: 0, selected: false },
  { id: "i2", variantIndex: 1, selected: true },
  { id: "i3", variantIndex: 2, selected: false },
];

describe("변형 선택", () => {
  it("먼저 풀고 나서 건다 — 인덱스가 지연 검사를 못 한다", () => {
    const steps = planSelection("p1", images, "i3");
    expect(steps[0]).toEqual({ action: "unselect", projectId: "p1" });
    expect(steps[1]).toEqual({ action: "select", imageId: "i3" });
  });

  it("이미 고른 것을 다시 고르면 아무것도 하지 않는다", () => {
    expect(planSelection("p1", images, "i2")).toEqual([]);
  });

  it("이 프로젝트에 없는 이미지는 고를 수 없다", () => {
    expect(() => planSelection("p1", images, "없는거")).toThrow();
  });
});

describe("수정 루프", () => {
  it("고른 것이 있어야 수정할 수 있다", () => {
    expect(canEdit(images)).toBe(true);
    expect(canEdit(images.map((image) => ({ ...image, selected: false })))).toBe(false);
  });

  it("수정은 고른 이미지를 기준으로 한 장만 만든다", () => {
    const job = planEditJob({
      projectId: "p1",
      parentImageId: "i2",
      parentUrl: "https://fal.media/i2.png",
      instruction: "배경을 밤으로 바꿔 주세요",
      modelId: "gpt-image-2",
      ratioId: "2:3",
      slots: EMPTY_SLOTS,
    });
    expect(job.variants).toBe(1);
    expect(job.parentImageId).toBe("i2");
    expect(job.referenceUrls).toEqual(["https://fal.media/i2.png"]);
  });

  it("수정 지시를 프롬프트에 담는다", () => {
    const job = planEditJob({
      projectId: "p1",
      parentImageId: "i2",
      parentUrl: "https://fal.media/i2.png",
      instruction: "배경을 밤으로 바꿔 주세요",
      modelId: "gpt-image-2",
      ratioId: "2:3",
      slots: EMPTY_SLOTS,
    });
    expect(job.editInstruction).toBe("배경을 밤으로 바꿔 주세요");
  });

  it("빈 수정 지시는 받지 않는다 — 같은 것을 또 만들 뿐이다", () => {
    expect(() => planEditJob({
      projectId: "p1",
      parentImageId: "i2",
      parentUrl: "https://fal.media/i2.png",
      instruction: "   ",
      modelId: "gpt-image-2",
      ratioId: "2:3",
      slots: EMPTY_SLOTS,
    })).toThrow();
  });

  it("다른 비율로 다시 만들 때도 고른 것을 기준으로 삼는다", () => {
    const job = planEditJob({
      projectId: "p1",
      parentImageId: "i2",
      parentUrl: "https://fal.media/i2.png",
      instruction: "세로 비율로 다시",
      modelId: "gpt-image-2",
      ratioId: "9:16",
      slots: EMPTY_SLOTS,
    });
    expect(job.ratioId).toBe("9:16");
    expect(job.referenceUrls).toEqual(["https://fal.media/i2.png"]);
  });
});
