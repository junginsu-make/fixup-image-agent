import {
  placeAsIsCapacity,
  validatePlaceAsIsCapacity,
  validatePlaceAsIsSlots,
  type PlaceAsIsPlacement,
} from "./attachments";

export const MIN_CARDS = 4;
export const MAX_CARDS = 8;
export const DEFAULT_CARD_COUNT = "auto" as const;

export interface SlotPlan {
  total: number | "auto";
  cover: number;
  placeAsIs: number;
  aiBody: number;
  ending: number;
  /** total 이 auto 일 때 AI 가 고를 수 있는 범위. */
  autoRange?: { min: number; max: number };
  issues: string[];
}

/**
 * 카드 자리를 나눈다.
 *
 * AI 에게 "몇 장 만들래?" 를 묻지 않는다. 표지·원본·마지막 장은 코드가 세고,
 * AI 는 남은 속지 자리만 채운다. 그래야 같은 입력에 같은 장수가 나온다.
 */
export function planSlots(input: {
  requested?: number | "auto";
  placeAsIsCount: number;
  hasEndingImage: boolean;
}): SlotPlan {
  const requested = input.requested ?? DEFAULT_CARD_COUNT;
  const cover = 1;
  const ending = 1;

  if (requested === "auto") {
    const issues = validatePlaceAsIsCapacity(input.placeAsIsCount, MAX_CARDS);
    const minimum = Math.min(MAX_CARDS, Math.max(MIN_CARDS, input.placeAsIsCount + cover + ending));
    return {
      total: "auto",
      cover,
      placeAsIs: input.placeAsIsCount,
      aiBody: 0,
      ending,
      autoRange: { min: minimum, max: MAX_CARDS },
      issues,
    };
  }

  if (requested < MIN_CARDS || requested > MAX_CARDS) {
    return {
      total: requested,
      cover,
      placeAsIs: input.placeAsIsCount,
      aiBody: 0,
      ending,
      issues: [`전체 장수는 ${MIN_CARDS}~${MAX_CARDS}장 중에서 고를 수 있습니다.`],
    };
  }

  const issues = validatePlaceAsIsCapacity(input.placeAsIsCount, requested);
  return {
    total: requested,
    cover,
    placeAsIs: input.placeAsIsCount,
    aiBody: Math.max(0, placeAsIsCapacity(requested) - input.placeAsIsCount),
    ending,
    issues,
  };
}

export type CardSlotKind = "cover" | "generated" | "place_as_is" | "ending_image";
export type CardSlotRole = "cover" | "body" | "ending";

export interface CardSlot {
  index: number;
  kind: CardSlotKind;
  role: CardSlotRole;
  attachmentId?: string;
}

export type CardLayout = CardSlot[] & { issues: string[] };

function result(slots: CardSlot[], issues: string[]): CardLayout {
  return Object.assign(slots, { issues });
}

/** 지정한 원본은 그 카드에, 미지정 원본은 남은 앞자리부터 넣는다. */
export function layoutCards(input: {
  total: number;
  placeAsIs: PlaceAsIsPlacement[];
  hasEndingImage: boolean;
}): CardLayout {
  if (input.total < MIN_CARDS || input.total > MAX_CARDS) {
    return result([], [`전체 장수는 ${MIN_CARDS}~${MAX_CARDS}장 중에서 고를 수 있습니다.`]);
  }

  const issues = validatePlaceAsIsSlots(input.placeAsIs, input.total);
  if (issues.length) return result([], issues);

  const slots: Array<CardSlot | undefined> = Array.from({ length: input.total });
  slots[0] = { index: 1, kind: "cover", role: "cover" };
  slots[input.total - 1] = {
    index: input.total,
    kind: input.hasEndingImage ? "ending_image" : "generated",
    role: "ending",
  };

  const specified = input.placeAsIs.filter((item) => item.bodySlot !== undefined);
  const unspecified = input.placeAsIs.filter((item) => item.bodySlot === undefined);

  for (const item of specified) {
    const cardNumber = item.bodySlot!;
    slots[cardNumber - 1] = {
      index: cardNumber,
      kind: "place_as_is",
      role: "body",
      attachmentId: item.id,
    };
  }

  for (const item of unspecified) {
    const offset = slots.findIndex((slot, index) => index >= 1 && index < input.total - 1 && slot === undefined);
    if (offset < 0) return result([], validatePlaceAsIsCapacity(input.placeAsIs.length, input.total));
    slots[offset] = {
      index: offset + 1,
      kind: "place_as_is",
      role: "body",
      attachmentId: item.id,
    };
  }

  for (let index = 1; index < input.total - 1; index += 1) {
    slots[index] ??= { index: index + 1, kind: "generated", role: "body" };
  }

  return result(slots as CardSlot[], []);
}
