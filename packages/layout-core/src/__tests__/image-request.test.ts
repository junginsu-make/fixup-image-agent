import { describe, expect, it } from "vitest";
import { planSlotImage } from "../image-request";

describe("planSlotImage", () => {
  it("정사각 칸은 고른 열거 모델에서 1:1 로 만든다", () => {
    const plan = planSlotImage({ width: 544, height: 544 }, "nano-banana-pro");

    expect(plan.model.id).toBe("nano-banana-pro");
    expect(plan.size).toMatchObject({ mode: "enum", aspectRatio: "1:1" });
    expect(plan.crop).toBe(false);
    expect(plan.notes).toEqual([]);
  });

  it("픽셀 모델은 칸 크기를 그대로 요청한다", () => {
    const plan = planSlotImage({ width: 1088, height: 1360 }, "gpt-image-2");

    expect(plan.size.mode).toBe("pixel");
    expect(plan.size.pixel).toEqual({ width: 1088, height: 1360 });
    expect(plan.crop).toBe(false);
  });

  it("열거 모델이 못 만드는 비율이면 만들 수 있는 모델로 바꾸고 이유를 남긴다", () => {
    const plan = planSlotImage({ width: 1024, height: 640 }, "nano-banana-pro");

    expect(plan.model.id).not.toBe("nano-banana-pro");
    expect(plan.crop).toBe(false);
    expect(plan.notes).toHaveLength(1);
    expect(plan.notes[0]).toContain("Nano Banana Pro");
  });

  it("어느 모델도 못 만드는 비율이면 가장 가까운 것으로 만들고 잘린다고 알린다", () => {
    const plan = planSlotImage({ width: 2000, height: 200 }, "nano-banana-pro");

    expect(plan.crop).toBe(true);
    expect(plan.notes.join(" ")).toContain("잘라");
  });

  it("모르는 모델 id 를 주면 기본 모델로 만든다", () => {
    const plan = planSlotImage({ width: 1088, height: 1088 }, "없는-모델");

    expect(plan.model.isDefault).toBe(true);
  });

  it("칸이 커도 모델 한계 안으로 줄여 요청한다", () => {
    const plan = planSlotImage({ width: 8000, height: 8000 }, "gpt-image-2");

    expect(plan.size.pixel!.width).toBeLessThanOrEqual(3840);
    expect(plan.size.pixel!.width).toBe(plan.size.pixel!.height);
    expect(plan.crop).toBe(false);
  });
});
