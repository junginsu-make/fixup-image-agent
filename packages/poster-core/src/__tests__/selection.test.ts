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

/**
 * 수정도 크기를 알아야 한다 (설계 §10 3-b 다섯 번째 파일).
 *
 * **`PosterEditJob` 에 `sourceSize` 가 아예 없었다.** `ratioId` 는 프로젝트의
 * 것을 그대로 쓰므로 `match-source` 가 들어가는데, 크기가 없으면
 * `buildPosterJob` 이 「첨부한 그림의 크기를 읽지 못해」로 거절한다.
 *
 * 광고가 만든 고장이 아니라 **이미 있던 고장**이다 — 지금도 「첨부한 그림과
 * 같은 비율」로 만든 사람은 수정을 못 쓴다. 3단계는 광고 경로 전원을
 * `match-source` 로 보내므로 그것을 간판 기능의 기본 경로로 승격시킨다.
 */
describe("수정에 크기를 실어 보낸다", () => {
  const base = {
    projectId: "p1", parentImageId: "i1", parentUrl: "https://x/1.png",
    instruction: "글자를 키워 주세요", modelId: "gpt-image-2", ratioId: "match-source",
    slots: EMPTY_SLOTS,
  };

  it("받은 크기를 그대로 싣는다", () => {
    const job = planEditJob({ ...base, sourceSize: { width: 2048, height: 1072 } });
    expect(job.sourceSize).toEqual({ width: 2048, height: 1072 });
  });

  it("없으면 없는 채로 둔다 — 지금까지의 모양이다", () => {
    expect(planEditJob(base).sourceSize).toBeUndefined();
  });
});
