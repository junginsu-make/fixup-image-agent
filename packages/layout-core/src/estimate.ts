import { unitPrice } from "@fixup/sns-core";
import { planSlotImage } from "./image-request";
import { slotRect, type CardSize, type LayoutSlot } from "./slots";

/**
 * 만들기 전에 값을 본다.
 *
 * **칸 하나가 fal 요청 하나다.** 그림 칸이 둘이면 두 번 부르고 비용도 두 배다.
 * 카드 한 장 값만 보여 주면 여덟 장짜리 세트에서 여덟 배로 놀란다.
 *
 * 레퍼런스를 붙여 만드는 것이 보통이라 편집(i2i) 값으로 잡는다 — 적게 잡는
 * 쪽이 위험하다.
 */

export interface SlotEstimate {
  /** 사람이 세는 번호. 1부터. */
  slot: number;
  modelId: string;
  modelLabel: string;
  /** 열거 모델이면 「1:1」, 픽셀 모델이면 「544×544」. */
  request: string;
  unitCostUsd: number;
  /** 받은 그림의 가운데를 잘라 넣는가. */
  cropped: boolean;
  notes: string[];
}

/** 카드 한 장의 그림 칸마다 어느 모델로 무엇을 부르는지. */
export function estimateSlots(
  slots: LayoutSlot[],
  size: CardSize,
  modelId: string,
): SlotEstimate[] {
  return slots.flatMap((slot, offset) => {
    if (slot.kind !== "image") return [];
    const rect = slotRect(slot.box, size);
    const plan = planSlotImage({ width: rect.width, height: rect.height }, modelId);
    return [{
      slot: offset + 1,
      modelId: plan.model.id,
      modelLabel: plan.model.label,
      request: plan.size.pixel
        ? `${plan.size.pixel.width}×${plan.size.pixel.height}`
        : plan.size.aspectRatio ?? "?",
      unitCostUsd: unitPrice(plan.model, "i2i", plan.size.pixel ?? { width: rect.width, height: rect.height }),
      cropped: plan.crop,
      notes: plan.notes,
    }];
  });
}

/** 값은 소수점 넷째 자리까지. 그보다 잘게 보여 줘도 읽는 사람이 없다. */
export function roundUsd(value: number): number {
  return Number(value.toFixed(4));
}

export function estimateTotalUsd(entries: SlotEstimate[]): number {
  return roundUsd(entries.reduce((sum, entry) => sum + entry.unitCostUsd, 0));
}
