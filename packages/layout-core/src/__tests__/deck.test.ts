import { describe, expect, it } from "vitest";
import { deckCards, deckEstimate, validateDeck } from "../deck";
import type { LayoutDeck } from "../deck";
import type { LayoutSlot } from "../slots";

const CARD = { width: 1088, height: 1360 };

const STYLE = {
  family: "Pretendard",
  weight: 700 as const,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left" as const,
  valign: "top" as const,
};

const TEXT_ONLY: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
  { kind: "text", box: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, source: { from: "copy", field: "headline" }, style: STYLE },
];

const ONE_IMAGE: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
  { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.5 } },
];

const TWO_IMAGES: LayoutSlot[] = [
  ...ONE_IMAGE,
  { kind: "image", box: { x: 0, y: 0.5, width: 1, height: 0.5 } },
];

function deck(patch: Partial<LayoutDeck> = {}): LayoutDeck {
  return {
    name: "시험용 세트",
    ratio: "4:5",
    total: 6,
    frames: { cover: TEXT_ONLY, body: TEXT_ONLY, ending: TEXT_ONLY },
    ...patch,
  };
}

describe("deckCards", () => {
  it("여섯 장이면 표지 1 · 속지 4 · 엔딩 1 이다", () => {
    const result = deckCards(6);

    expect(result.issues).toEqual([]);
    expect(result.cards.map((card) => card.role))
      .toEqual(["cover", "body", "body", "body", "body", "ending"]);
    expect(result.cards.map((card) => card.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("가장 적은 네 장에서도 표지와 엔딩은 한 장씩이다", () => {
    const roles = deckCards(4).cards.map((card) => card.role);

    expect(roles).toEqual(["cover", "body", "body", "ending"]);
  });

  it("만들 수 있는 장수를 벗어나면 이유를 준다", () => {
    for (const total of [3, 9]) {
      const result = deckCards(total);
      expect(result.cards).toEqual([]);
      expect(result.issues).toHaveLength(1);
    }
  });
});

describe("deckEstimate", () => {
  it("그림 칸이 없는 세트는 부르지도, 쓰지도 않는다", () => {
    const estimate = deckEstimate(deck(), CARD, "gpt-image-2");

    expect(estimate.calls).toBe(0);
    expect(estimate.totalUsd).toBe(0);
  });

  it("속지 틀의 그림 칸은 속지 장수만큼 부른다", () => {
    const estimate = deckEstimate(
      deck({ total: 6, frames: { cover: TEXT_ONLY, body: ONE_IMAGE, ending: TEXT_ONLY } }),
      CARD,
      "gpt-image-2",
    );

    // 여섯 장 중 속지는 넉 장. 장마다 그림 칸 하나.
    expect(estimate.calls).toBe(4);
  });

  it("표지·속지·엔딩의 그림 칸을 모두 더한다", () => {
    const estimate = deckEstimate(
      deck({ total: 5, frames: { cover: ONE_IMAGE, body: TWO_IMAGES, ending: ONE_IMAGE } }),
      CARD,
      "gpt-image-2",
    );

    // 표지 1 + 속지 3장 × 2칸 + 엔딩 1 = 8
    expect(estimate.calls).toBe(8);
  });

  it("장수가 범위 밖이면 조용히 0원이라 하지 않고 이유를 준다", () => {
    const estimate = deckEstimate(deck({ total: 99 }), CARD, "gpt-image-2");

    expect(estimate.calls).toBe(0);
    expect(estimate.issues).toHaveLength(1);
  });

  it("제대로 된 세트에는 할 말이 없다", () => {
    expect(deckEstimate(deck(), CARD, "gpt-image-2").issues).toEqual([]);
  });

  it("자리마다 몇 장에 얼마인지 따로 알려 준다", () => {
    const estimate = deckEstimate(
      deck({ total: 6, frames: { cover: ONE_IMAGE, body: TEXT_ONLY, ending: TEXT_ONLY } }),
      CARD,
      "gpt-image-2",
    );
    const cover = estimate.roles.find((entry) => entry.role === "cover")!;
    const body = estimate.roles.find((entry) => entry.role === "body")!;

    expect(cover.cards).toBe(1);
    expect(body.cards).toBe(4);
    expect(cover.usd).toBeGreaterThan(0);
    expect(body.usd).toBe(0);
    expect(estimate.totalUsd).toBe(cover.usd);
  });

  /**
   * 자리 값은 **장수를 곱한 값**이다. 한 장 값만 보여 주면 속지 다섯 장짜리
   * 세트에서 다섯 배로 놀란다.
   */
  it("자리 값은 카드 한 장 값에 그 자리 장수를 곱한 값이다", () => {
    const oneCard = deckEstimate(
      deck({ total: 4, frames: { cover: ONE_IMAGE, body: TEXT_ONLY, ending: TEXT_ONLY } }),
      CARD,
      "gpt-image-2",
    );
    const perCard = oneCard.roles.find((entry) => entry.role === "cover")!.usd;

    const many = deckEstimate(
      deck({ total: 7, frames: { cover: TEXT_ONLY, body: ONE_IMAGE, ending: TEXT_ONLY } }),
      CARD,
      "gpt-image-2",
    );
    const body = many.roles.find((entry) => entry.role === "body")!;

    // 일곱 장 중 속지는 다섯 장. 표지 칸과 속지 칸이 같은 상자라 한 장 값이 같다.
    expect(body.cards).toBe(5);
    expect(body.usd).toBeCloseTo(perCard * 5, 4);
    expect(many.calls).toBe(5);
  });

  it("합계는 자리 셋을 더한 값이고, 빠뜨린 자리가 없다", () => {
    const estimate = deckEstimate(
      deck({ total: 7, frames: { cover: ONE_IMAGE, body: ONE_IMAGE, ending: ONE_IMAGE } }),
      CARD,
      "gpt-image-2",
    );
    const byRole = Object.fromEntries(estimate.roles.map((entry) => [entry.role, entry.usd]));

    expect(estimate.totalUsd).toBeCloseTo(byRole.cover! + byRole.body! + byRole.ending!, 4);
    // 셋 다 값이 있어야 한다 — 한 자리를 0 으로 빠뜨려도 위 등식은 성립한다.
    expect([byRole.cover, byRole.body, byRole.ending].every((usd) => usd! > 0)).toBe(true);
    expect(estimate.calls).toBe(7);
  });
});

describe("validateDeck", () => {
  it("제대로 된 세트는 문제가 없다", () => {
    expect(validateDeck(deck())).toEqual([]);
  });

  it("칸이 빈 자리가 있으면 어느 자리인지 말해 준다", () => {
    const issues = validateDeck(deck({ frames: { cover: [], body: TEXT_ONLY, ending: TEXT_ONLY } }));

    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("표지"))).toBe(true);
  });

  it("장수가 범위를 벗어나면 오류다", () => {
    expect(validateDeck(deck({ total: 12 })).some((issue) => issue.severity === "error")).toBe(true);
  });

  it("자리 틀 안의 문제도 그 자리 이름을 붙여 올린다", () => {
    const outside: LayoutSlot[] = [{ kind: "image", box: { x: 0.5, y: 0, width: 0.9, height: 0.5 } }];
    const issues = validateDeck(deck({ frames: { cover: TEXT_ONLY, body: outside, ending: TEXT_ONLY } }));

    expect(issues.some((issue) => issue.message.includes("속지") && issue.message.includes("카드 밖"))).toBe(true);
  });
});
