import type { CardSize, LayoutSlot } from "./slots";

/**
 * 칸 프롬프트 — **그 칸에 들어갈 그림만** 말한다.
 *
 * 카드 전체 프롬프트를 그대로 쓰면 모델이 카드를 통째로 그린다. 레이아웃도
 * 글자도 다시 그려서, 우리가 칸을 정해 둔 뜻이 사라진다.
 *
 * 「글자 넣지 마」를 반드시 넣는다. 안 넣으면 모델이 그림 안에 제목을 그려
 * 우리가 그린 글자와 겹친다 — 이 기능이 존재하는 이유가 바로 그것이다.
 */

/** 나눠떨어지는 비율만 이름으로 부른다. 「17:13」 은 이름이 아니다. */
const NAMED_RATIO_LIMIT = 32;

function greatestCommonDivisor(first: number, second: number): number {
  return second === 0 ? first : greatestCommonDivisor(second, first % second);
}

export function slotAspectLabel(rect: CardSize): string {
  const divisor = greatestCommonDivisor(rect.width, rect.height);
  const width = rect.width / divisor;
  const height = rect.height / divisor;
  if (width <= NAMED_RATIO_LIMIT && height <= NAMED_RATIO_LIMIT) return `${width}:${height}`;
  return `${rect.width}×${rect.height}`;
}

export interface SlotPromptInput {
  slot: Extract<LayoutSlot, { kind: "image" }>;
  /** 칸의 픽셀 크기. */
  rect: CardSize;
  /** 칸에 따로 적은 것이 없을 때 쓸 카드 기획의 그림 설명. */
  visualBrief: string;
  /** 레퍼런스 지시. 기존 `buildAttachmentBlock` 결과를 그대로 넣는다. */
  styleBlock: string;
}

export function buildSlotPrompt(input: SlotPromptInput): string {
  const subject = input.slot.brief?.trim() || input.visualBrief.trim();
  return [
    `A single image to fill a ${slotAspectLabel(input.rect)} area of a card.`,
    `Subject: ${subject}`,
    input.styleBlock.trim() ? `Style:\n${input.styleBlock.trim()}` : "",
    "No text, no letters, no numbers, no logos, no watermark, no borders.",
    "Fill the entire frame; the important subject must not touch the edges.",
  ].filter(Boolean).join("\n\n");
}
