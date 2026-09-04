import { imageLookDirective, userInstructionHead, userInstructionTail, type ImageLook } from "@fixup/shared";
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
  /**
   * 이미지의 결. 안 주면 `auto` — 첨부 레퍼런스의 결을 그대로 따라간다.
   *
   * 넣을지 말지는 `imageLookDirective` 가 정한다. 부르는 쪽마다 판단하면
   * 언젠가 한 곳이 어긋나서, 같은 「애니」인데 칸마다 다른 그림이 나온다.
   */
  look?: ImageLook;
  /** 사용자가 직접 친 지시. 통짜 카드와 같은 말이 칸에도 그대로 가야 한다. */
  userInstruction?: string;
}

export function buildSlotPrompt(input: SlotPromptInput): string {
  const subject = input.slot.brief?.trim() || input.visualBrief.trim();
  const instruction = input.userInstruction ?? "";
  const look = imageLookDirective(input.look ?? "auto");
  return [
    // 사용자 지시는 맨 앞과 맨 뒤 양쪽에 둔다. 긴 프롬프트에서 가운데 문장은
    // 힘을 잃는다(2026-09-04 실측).
    userInstructionHead(instruction),
    `A single image to fill a ${slotAspectLabel(input.rect)} area of a card.`,
    `Subject: ${subject}`,
    input.styleBlock.trim() ? `Style:\n${input.styleBlock.trim()}` : "",
    look ? `Rendering style — this overrides the rendering style of the reference:\n${look}` : "",
    "No text, no letters, no numbers, no logos, no watermark, no borders.",
    "Fill the entire frame; the important subject must not touch the edges.",
    userInstructionTail(instruction),
  ].filter(Boolean).join("\n\n");
}
