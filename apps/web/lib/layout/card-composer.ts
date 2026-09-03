import "server-only";

import type { CardSize, LayoutSlot } from "@fixup/layout-core";
import type { CardCopy } from "@fixup/sns-core";
import { composeCard } from "./compose";
import { loadLogos } from "./preview-service";
import { markAsAi } from "../watermark";

/**
 * 카드 한 장을 실제로 완성한다 — 미리보기가 아니라 저장될 그림이다.
 *
 * 미리보기(`preview-service.ts`)와 다른 점은 둘이다. fal 이 그려 준 그림이
 * 실제로 들어오고, **"AI 이미지" 표기를 붙인다.** 표기는 파일 안에 새긴다 —
 * 화면에만 덧씌우면 내려받는 순간 사라져서 알리려는 목적이 사라진다.
 */

export interface ComposedCard {
  png: Buffer;
  warnings: string[];
}

export async function composeLayoutCard(input: {
  userId: string;
  size: CardSize;
  slots: LayoutSlot[];
  copy: CardCopy;
  /**
   * fal 이 그려 준 그림 — **칸 번호별로.**
   *
   * 그림 자리가 셋이면 셋 다 들어온다. 못 받은 칸은 빠지고 그 자리만 회색으로
   * 남는다 — 한 칸 때문에 카드를 잃지 않는다.
   */
  slotImages?: Record<number, Buffer>;
}): Promise<ComposedCard> {
  const composed = await composeCard({
    size: input.size,
    slots: input.slots,
    copy: input.copy,
    images: input.slotImages ?? {},
    logos: await loadLogos(input.userId, input.slots),
  });

  // 표기를 못 넣었다고 카드를 잃을 수는 없다. markAsAi 가 실패해도 원본을 돌려준다.
  return { png: await markAsAi(composed.png), warnings: composed.warnings };
}
