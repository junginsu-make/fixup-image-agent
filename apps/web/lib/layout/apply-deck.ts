import type { DeckRole, LayoutDeck, LayoutSlot } from "@fixup/layout-core";
import type { SnsFlowCard } from "../../app/api/sns/flow-service";

/**
 * 세트를 작업의 카드마다 붙인다.
 *
 * **AI 가 그리는 카드에만 붙인다.** 원본 그대로 쓸 장과 엔딩 그림은 사용자가
 * 올린 그림을 그대로 넣는 자리라, 거기에 뼈대를 씌우면 그 그림을 우리가
 * 덮어 그리게 된다.
 *
 * 뼈대는 **복사해서 박는다.** 세트를 나중에 고쳤을 때 지난 작업이 소리 없이
 * 달라지면 안 된다.
 */
export function applyDeck(cards: SnsFlowCard[], deck: LayoutDeck, deckId: string): SnsFlowCard[] {
  return cards.map((card) => {
    if (card.kind !== "generated") return card;
    const role = card.role as DeckRole;
    return {
      ...card,
      layout: {
        // 어느 세트의 어느 자리에서 왔는지 남긴다. 나중에 「왜 이렇게 나왔지」를 볼 때 쓴다.
        templateId: `${deckId}:${role}`,
        slots: structuredClone(deck.frames[role]),
      },
    };
  });
}

/** 뼈대를 떼면 지금까지 방식(통째로 그리기)으로 돌아간다. */
export function clearLayout(cards: SnsFlowCard[]): SnsFlowCard[] {
  return cards.map(({ layout: _layout, ...card }) => card);
}

/**
 * 카드 한 장에만 뼈대를 붙인다.
 *
 * 세트는 자리별로 한 번에 붙이는 편의이고, 이것은 그 위에 얹는 예외다 —
 * 「3번 속지만 다른 모양으로」가 실제로 자주 필요하다. 세트를 붙인 뒤 이걸로
 * 갈아 끼우면 그 카드만 바뀌고 나머지는 그대로다.
 */
export function applyCardLayout(
  cards: SnsFlowCard[],
  cardIndex: number,
  layout: { templateId: string; slots: LayoutSlot[] },
): SnsFlowCard[] {
  return cards.map((card) => {
    if (card.index !== cardIndex || card.kind !== "generated") return card;
    return {
      ...card,
      layout: { templateId: layout.templateId, slots: structuredClone(layout.slots) },
    };
  });
}

/** 그 카드만 뼈대를 뗀다. 나머지 카드는 그대로 둔다. */
export function clearCardLayout(cards: SnsFlowCard[], cardIndex: number): SnsFlowCard[] {
  return cards.map((card) => {
    if (card.index !== cardIndex) return card;
    const { layout: _layout, ...rest } = card;
    return rest;
  });
}
