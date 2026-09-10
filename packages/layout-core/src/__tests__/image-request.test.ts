import { describe, expect, it } from "vitest";
import { CARD_RATIOS } from "@fixup/sns-core";
import { planSlotImage } from "../image-request";
import { slotRect } from "../slots";
import { DEFAULT_TEMPLATES } from "../template";

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
    expect(plan.notes[0]).toContain("속도형은");
    expect(plan.notes[0]).toContain("표준형으로");
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

  /**
   * 칸 비율 그대로 시키되 **크기도 칸에 맞춰야** 한다.
   *
   * 비율만 맞추고 크기를 안 보면 4메가픽셀짜리를 시켜 0.3메가픽셀 칸에
   * 줄여 붙인다. fal 은 느려지고 값은 가격표 한 칸 위로 올라간다.
   */
  it("픽셀 모델은 칸 크기에 가장 가까운 것을 고른다", () => {
    const rect = { width: 435, height: 642 };
    const plan = planSlotImage(rect, "gpt-image-2");
    const pixel = plan.size.pixel!;

    // 모델 최소치(0.65MP)가 있어 칸보다 크기는 하지만 세 배를 넘지 않는다.
    expect(pixel.width * pixel.height).toBeLessThan(rect.width * rect.height * 3);
    const gap = Math.abs(pixel.width / pixel.height - rect.width / rect.height) / (rect.width / rect.height);
    expect(gap).toBeLessThan(0.01);
  });

  it("기본 뼈대 어느 비율에서도 칸의 세 배를 넘게 요청하지 않는다", () => {
    const oversized: string[] = [];

    for (const ratio of CARD_RATIOS) {
      for (const template of DEFAULT_TEMPLATES) {
        template.slots.forEach((slot, offset) => {
          if (slot.kind !== "image") return;
          const rect = slotRect(slot.box, ratio.pixel);
          const pixel = planSlotImage({ width: rect.width, height: rect.height }, "gpt-image-2").size.pixel;
          if (!pixel) return;
          const multiple = (pixel.width * pixel.height) / (rect.width * rect.height);
          if (multiple > 3) oversized.push(`${ratio.id} ${template.id} #${offset + 1} ${multiple.toFixed(1)}배`);
        });
      }
    }

    expect(oversized).toEqual([]);
  });
});
