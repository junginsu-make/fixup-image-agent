import { MAX_CARDS, MIN_CARDS, layoutCards } from "@fixup/sns-core";
import { estimateSlots, estimateTotalUsd, roundUsd, type SlotEstimate } from "./estimate";
import type { CardSize, LayoutSlot } from "./slots";
import { validateTemplate, type TemplateIssue } from "./template";

/**
 * 세트 — 표지 1장 · 속지 N장 · 엔딩 1장을 한 번에 정한다.
 *
 * 뼈대의 단위는 여전히 **카드 한 장**이다. 세트는 그 위에 얹는 편의층이다 —
 * 장마다 드롭다운을 열지 않고 자리별로 한 번씩만 고른다.
 *
 * 장수 구조를 여기서 다시 세지 않는다. 기존 카드뉴스가 이미 `layoutCards` 로
 * 세고 있고, 두 곳에서 세면 언젠가 둘이 어긋난다.
 *
 * 틀은 **복사해서 담는다.** 템플릿 id 만 두면 나중에 그 템플릿을 고쳤을 때
 * 지난 세트가 소리 없이 달라진다.
 */

export type DeckRole = "cover" | "body" | "ending";

export const DECK_ROLE_LABEL: Record<DeckRole, string> = {
  cover: "표지",
  body: "속지",
  ending: "엔딩",
};

export interface LayoutDeck {
  name: string;
  /** `CARD_RATIOS` 의 id. */
  ratio: string;
  /** 전체 장수. */
  total: number;
  frames: Record<DeckRole, LayoutSlot[]>;
}

export interface DeckCard {
  index: number;
  role: DeckRole;
}

/** 이 장수면 몇 번 카드가 어느 자리인가. */
export function deckCards(total: number): { cards: DeckCard[]; issues: string[] } {
  // 원본 그대로 쓸 장·엔딩 그림은 세트가 정하는 것이 아니다. 자리만 센다.
  const laid = layoutCards({ total, placeAsIs: [], hasEndingImage: false });
  if (laid.issues.length) return { cards: [], issues: laid.issues };
  return { cards: laid.map((card) => ({ index: card.index, role: card.role })), issues: [] };
}

export interface DeckRoleEstimate {
  role: DeckRole;
  /** 이 자리에 몇 장이 들어가나. */
  cards: number;
  /** 카드 한 장의 그림 칸들. */
  slots: SlotEstimate[];
  /** 이 자리 전체 값. */
  usd: number;
}

export interface DeckEstimate {
  /** fal 을 몇 번 부르나. */
  calls: number;
  totalUsd: number;
  roles: DeckRoleEstimate[];
  /** 셈이 성립하지 않은 이유. 조용히 0원이라고 하면 안 된다. */
  issues: string[];
}

export function deckEstimate(deck: LayoutDeck, size: CardSize, modelId: string): DeckEstimate {
  // 장수가 범위 밖이면 자리가 하나도 안 나온다. 그걸 「0원」으로 보여 주면
  // 사람은 공짜인 줄 안다. 이유를 함께 올린다.
  const laid = deckCards(deck.total);
  const cards = laid.cards;

  const roles: DeckRoleEstimate[] = (Object.keys(DECK_ROLE_LABEL) as DeckRole[]).map((role) => {
    const count = cards.filter((card) => card.role === role).length;
    const slots = estimateSlots(deck.frames[role], size, modelId);
    return { role, cards: count, slots, usd: roundUsd(estimateTotalUsd(slots) * count) };
  });

  return {
    calls: roles.reduce((sum, entry) => sum + entry.slots.length * entry.cards, 0),
    totalUsd: roundUsd(roles.reduce((sum, entry) => sum + entry.usd, 0)),
    roles,
    issues: laid.issues,
  };
}

export function validateDeck(deck: LayoutDeck): TemplateIssue[] {
  const issues: TemplateIssue[] = [];

  if (!Number.isInteger(deck.total) || deck.total < MIN_CARDS || deck.total > MAX_CARDS) {
    issues.push({
      severity: "error",
      message: `전체 장수는 ${MIN_CARDS}~${MAX_CARDS}장 중에서 고를 수 있습니다.`,
    });
  }

  for (const role of Object.keys(DECK_ROLE_LABEL) as DeckRole[]) {
    const label = DECK_ROLE_LABEL[role];
    // 어느 자리가 문제인지 말하지 않으면 세 틀 중 어디를 고쳐야 할지 모른다.
    for (const issue of validateTemplate({ id: role, name: label, role, slots: deck.frames[role] })) {
      issues.push({ severity: issue.severity, message: `${label} 틀 · ${issue.message}` });
    }
  }
  return issues;
}
