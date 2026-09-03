import { describe, expect, it } from "vitest";
import type { LayoutDeck, LayoutSlot } from "@fixup/layout-core";
import type { SnsFlowCard } from "../../../app/api/sns/flow-service";
import { applyCardLayout, applyDeck, clearCardLayout, clearLayout } from "../apply-deck";

function frame_(fill: string): LayoutSlot[] {
  return [{ kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill }];
}

const DECK: LayoutDeck = {
  name: "세트",
  ratio: "4:5",
  total: 4,
  frames: { cover: frame_("#111111"), body: frame_("#222222"), ending: frame_("#333333") },
};

function card(patch: Partial<SnsFlowCard>): SnsFlowCard {
  return {
    index: 1,
    kind: "generated",
    role: "body",
    copy: { index: 1, headline: "제목" },
    status: "pending",
    ...patch,
  };
}

describe("applyDeck", () => {
  it("자리에 맞는 틀을 붙인다", () => {
    const applied = applyDeck(
      [card({ index: 1, role: "cover" }), card({ index: 2, role: "body" }), card({ index: 3, role: "ending" })],
      DECK,
      "deck-1",
    );

    expect(applied.map((entry) => (entry.layout?.slots[0] as { fill: string } | undefined)?.fill))
      .toEqual(["#111111", "#222222", "#333333"]);
  });

  /**
   * 원본 그대로 쓸 장과 엔딩 그림은 사용자의 그림을 그대로 넣는 자리다.
   * 거기에 뼈대를 씌우면 사용자가 올린 그림을 우리가 덮어 그린다.
   */
  it("AI 가 그리는 카드에만 붙인다", () => {
    const applied = applyDeck(
      [card({ index: 1, kind: "place_as_is" }), card({ index: 2, kind: "ending_image" }), card({ index: 3 })],
      DECK,
      "deck-1",
    );

    expect(applied.map((entry) => Boolean(entry.layout))).toEqual([false, false, true]);
  });

  it("이미 붙어 있던 뼈대는 갈아 끼운다", () => {
    const before = applyDeck([card({ role: "cover" })], DECK, "deck-1");
    const after = applyDeck(before, { ...DECK, frames: { ...DECK.frames, cover: frame_("#AAAAAA") } }, "deck-2");

    expect((after[0]!.layout!.slots[0] as { fill: string }).fill).toBe("#AAAAAA");
    expect(after[0]!.layout!.templateId).toBe("deck-2:cover");
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const cards = [card({ role: "cover" })];
    applyDeck(cards, DECK, "deck-1");

    expect(cards[0]!.layout).toBeUndefined();
  });

  it("뼈대는 복사해서 박는다 — 세트를 나중에 고쳐도 지난 카드는 그대로다", () => {
    const applied = applyDeck([card({ role: "cover" })], DECK, "deck-1");

    expect(applied[0]!.layout!.slots).not.toBe(DECK.frames.cover);
    expect(applied[0]!.layout!.slots).toEqual(DECK.frames.cover);
  });
});

describe("clearLayout", () => {
  it("전부 떼면 지금까지 방식으로 돌아간다", () => {
    const applied = applyDeck([card({ role: "cover" }), card({ index: 2 })], DECK, "deck-1");
    const cleared = clearLayout(applied);

    expect(cleared.every((entry) => entry.layout === undefined)).toBe(true);
  });
});

describe("applyCardLayout", () => {
  const frame = frame_("#AAAAAA");

  it("고른 카드에만 붙인다", () => {
    const cards = [card({ index: 1 }), card({ index: 2 }), card({ index: 3 })];
    const applied = applyCardLayout(cards, 2, { templateId: "t-1", slots: frame });

    expect(applied.map((entry) => Boolean(entry.layout))).toEqual([false, true, false]);
    expect(applied[1]!.layout!.templateId).toBe("t-1");
  });

  it("세트로 붙여 둔 것을 그 카드만 갈아 끼운다", () => {
    const applied = applyDeck([card({ index: 1, role: "body" }), card({ index: 2, role: "body" })], DECK, "deck-1");
    const changed = applyCardLayout(applied, 2, { templateId: "t-1", slots: frame });

    expect((changed[0]!.layout!.slots[0] as { fill: string }).fill).toBe("#222222");
    expect((changed[1]!.layout!.slots[0] as { fill: string }).fill).toBe("#AAAAAA");
  });

  it("AI 가 그리는 카드가 아니면 붙이지 않는다", () => {
    const cards = [card({ index: 1, kind: "place_as_is" })];

    expect(applyCardLayout(cards, 1, { templateId: "t-1", slots: frame })[0]!.layout).toBeUndefined();
  });

  it("없는 카드 번호를 주면 아무것도 바뀌지 않는다", () => {
    const cards = [card({ index: 1 })];

    expect(applyCardLayout(cards, 9, { templateId: "t-1", slots: frame })).toEqual(cards);
  });

  it("틀은 복사해서 박는다", () => {
    const applied = applyCardLayout([card({ index: 1 })], 1, { templateId: "t-1", slots: frame });

    expect(applied[0]!.layout!.slots).not.toBe(frame);
    expect(applied[0]!.layout!.slots).toEqual(frame);
  });

  it("원래 배열을 바꾸지 않는다", () => {
    const cards = [card({ index: 1 })];
    applyCardLayout(cards, 1, { templateId: "t-1", slots: frame });

    expect(cards[0]!.layout).toBeUndefined();
  });
});

describe("clearCardLayout", () => {
  it("그 카드만 뗀다", () => {
    const applied = applyDeck([card({ index: 1, role: "body" }), card({ index: 2, role: "body" })], DECK, "deck-1");
    const cleared = clearCardLayout(applied, 1);

    expect(cleared[0]!.layout).toBeUndefined();
    expect(cleared[1]!.layout).toBeDefined();
  });
});
