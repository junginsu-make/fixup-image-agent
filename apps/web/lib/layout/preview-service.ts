import "server-only";

import { estimateSlots, estimateTotalUsd, type CardSize, type LayoutSlot, type SlotEstimate } from "@fixup/layout-core";
import type { CardCopy } from "@fixup/sns-core";
import { composeCard } from "./compose";
import { referenceImageBytes } from "./library-image";

/**
 * 뼈대를 그려 본다 — 한 장이든 한 세트든 여기를 지난다.
 *
 * **fal 을 부르지 않는다.** 그림 칸은 회색 상자로 두고, 대신 「이걸로 만들면
 * 몇 번 부르고 얼마」를 같이 돌려준다. 미리 보는 데 돈이 나가면 아무도 미리
 * 보지 않는다.
 *
 * 로고만은 진짜를 넣는다. 로고 자리에 회색 상자를 두면 그게 로고인 줄 안다.
 */

export interface RenderedCard {
  /** data URL. */
  image: string;
  warnings: string[];
  slots: SlotEstimate[];
  unitUsd: number;
}

export async function renderPreviewCard(input: {
  userId: string;
  size: CardSize;
  slots: LayoutSlot[];
  copy: CardCopy;
  modelId: string;
}): Promise<RenderedCard> {
  const composed = await composeCard({
    size: input.size,
    slots: input.slots,
    copy: input.copy,
    logos: await loadLogos(input.userId, input.slots),
    preview: true,
  });
  const slots = estimateSlots(input.slots, input.size, input.modelId);

  return {
    image: `data:image/png;base64,${composed.png.toString("base64")}`,
    warnings: composed.warnings,
    slots,
    unitUsd: estimateTotalUsd(slots),
  };
}

/** 같은 로고를 여러 칸이 쓰면 한 번만 읽는다. */
export async function loadLogos(userId: string, slots: LayoutSlot[]): Promise<Record<number, Buffer>> {
  const wanted = new Map<string, number[]>();
  slots.forEach((slot, offset) => {
    if (slot.kind !== "logo" || !slot.referenceImageId) return;
    wanted.set(slot.referenceImageId, [...(wanted.get(slot.referenceImageId) ?? []), offset]);
  });

  const logos: Record<number, Buffer> = {};
  for (const [id, offsets] of wanted) {
    const image = await referenceImageBytes(userId, id);
    if (!image) continue;
    for (const offset of offsets) logos[offset] = image.bytes;
  }
  return logos;
}
