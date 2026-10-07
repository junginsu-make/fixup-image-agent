import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLOW_CARD_MS, SLOW_CARD_NOTICE, cardSubmittedAt, rememberGenerating, slowCardIndexes } from "../slow-card";
import { cardnewsView } from "../../easy/cardnews-view";

/**
 * **카드 한 장이 3분을 넘으면 늦어지고 있다고 알린다**(2026-10-07 Task 6).
 *
 * fal 한 장이 446초 걸린 날 화면은 말없이 「만드는 중」이었다. 안내만 한다 — 다시 보내거나
 * 취소하지 않는다(이미 보낸 요청은 값이 나가므로 다시 보내면 두 번 낸다). 기준은 fal 에 실제로
 * 보낸 시각이고, 카드에 그 시각이 없으면 화면이 「만드는 중」을 처음 본 시각이다.
 */
const T0 = Date.parse("2026-10-07T08:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("보낸 시각", () => {
  it("통짜 카드는 카드의 시각", () => {
    expect(cardSubmittedAt({ generationStartedAt: iso(T0) })).toBe(T0);
  });

  it("레이아웃 카드는 지금 돌고 있는 칸의 시각", () => {
    expect(cardSubmittedAt({
      generationStartedAt: iso(T0 - 600_000),
      slotJobs: [
        { status: "done", startedAt: iso(T0 - 300_000) },
        { status: "generating", startedAt: iso(T0) },
      ],
    })).toBe(T0);
  });

  it("없거나 읽을 수 없으면 모른다", () => {
    expect(cardSubmittedAt({})).toBeUndefined();
    expect(cardSubmittedAt({ generationStartedAt: "아님" })).toBeUndefined();
  });
});

describe("늦은 카드", () => {
  const generating = (index: number, submittedAt?: number) => ({ index, status: "generating", submittedAt });

  it("보낸 지 3분이 되면 늦은 카드다", () => {
    expect(SLOW_CARD_MS).toBe(3 * 60_000);
    const cards = [generating(1, T0)];
    expect(slowCardIndexes(cards, {}, T0 + SLOW_CARD_MS - 1)).toEqual([]);
    expect(slowCardIndexes(cards, {}, T0 + SLOW_CARD_MS)).toEqual([1]);
  });

  it("만드는 중이 아닌 카드는 늦은 카드가 아니다", () => {
    const cards = ["pending", "done", "failed", "review_required"].map((status, offset) => ({ index: offset + 1, status, submittedAt: T0 }));
    expect(slowCardIndexes(cards, {}, T0 + 10 * SLOW_CARD_MS)).toEqual([]);
  });

  it("보낸 시각이 없으면 처음 본 시각부터 잰다", () => {
    const cards = [generating(2)];
    const seen = rememberGenerating({}, cards, T0);
    expect(seen).toEqual({ 2: T0 });
    expect(slowCardIndexes(cards, seen, T0 + SLOW_CARD_MS - 1)).toEqual([]);
    expect(slowCardIndexes(cards, seen, T0 + SLOW_CARD_MS)).toEqual([2]);
    // 처음 본 적도 없으면 늦었다고 하지 않는다.
    expect(slowCardIndexes(cards, {}, T0 + 10 * SLOW_CARD_MS)).toEqual([]);
  });

  it("처음 본 시각은 다시 보아도 안 바뀌고, 만드는 중이 끝나면 지운다", () => {
    const first = rememberGenerating({}, [generating(1), generating(2)], T0);
    const again = rememberGenerating(first, [generating(1), { index: 2, status: "done" }], T0 + 60_000);
    expect(again).toEqual({ 1: T0 });
    expect(first).toEqual({ 1: T0, 2: T0 });
  });

  it("안내 문구는 줄표 없이 기다려 달라고만 한다", () => {
    expect(SLOW_CARD_NOTICE).toBe("그림 업체가 늦어지고 있습니다. 조금만 더 기다려 주세요.");
  });
});

describe("「쉽게」 카드 보기", () => {
  it("만드는 중인 장에만 보낸 시각을 싣는다", () => {
    const view = cardnewsView({
      id: "p1", status: "generating", ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "auto",
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: { cards: [
          { index: 1, role: "cover", copy: { headline: "a" }, status: "done", generationStartedAt: iso(T0 - 60_000) },
          { index: 2, role: "body", copy: { headline: "b" }, status: "generating", generationStartedAt: iso(T0) },
          { index: 3, role: "body", copy: { headline: "c" }, status: "generating" },
        ] },
      },
    }, "image-v2");
    expect(view.cards.map((card) => card.submittedAt)).toEqual([undefined, T0, undefined]);
    expect("submittedAt" in view.cards[0]!).toBe(false);
  });
});

describe("화면 배선", () => {
  const board = readFileSync(new URL("../[id]/result-board.tsx", import.meta.url), "utf8");
  const easy = readFileSync(new URL("../../easy/_components/cardnews-card.tsx", import.meta.url), "utf8");

  it("카드뉴스 결과판이 늦은 카드에 안내를 단다", () => {
    expect(board).toContain("useSlowCards(");
    expect(board).toContain("SLOW_CARD_NOTICE");
  });

  it("「쉽게」 카드뉴스 진행 줄도 안내를 단다", () => {
    expect(easy).toContain("useSlowCards(");
    expect(easy).toContain("SLOW_CARD_NOTICE");
  });

  it("안내만 한다 — 다시 보내거나 멈추지 않는다", () => {
    const hook = readFileSync(new URL("../use-slow-cards.ts", import.meta.url), "utf8");
    expect(hook).not.toMatch(/fetch\(|\/api\//);
  });
});
