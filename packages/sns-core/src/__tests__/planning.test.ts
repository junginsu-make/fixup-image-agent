import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_PLANNING_PROVIDER,
  PRIMARY_PLANNING_MODEL,
  buildPlanPrompt,
  planCards,
} from "../planning";

const base = {
  sourceText: "AI 자동화는 단일 업무부터 시작해야 한다. ...",
  slots: { total: 6, cover: 1, placeAsIs: 2, aiBody: 2, ending: 1, issues: [] },
  toneNote: "친구에게 말하듯 가볍게",
  language: "ko" as const,
};

const autoBase = {
  ...base,
  slots: {
    total: "auto" as const,
    cover: 1,
    placeAsIs: 2,
    aiBody: 0,
    ending: 1,
    autoRange: { min: 4, max: 8 },
    issues: [],
  },
};

const card = (index: number, role: "cover" | "body" = index === 1 ? "cover" : "body") => ({
  index,
  role,
  intent: `의도${index}`,
  visualBrief: `장면${index}`,
});

describe("기획 제공자", () => {
  it("주 모델은 claude-sonnet-5, 예비는 OpenAI 다", () => {
    expect(PRIMARY_PLANNING_MODEL).toBe("claude-sonnet-5");
    expect(BACKUP_PLANNING_PROVIDER).toBe("openai");
  });
});

describe("기획 프롬프트", () => {
  it("몇 장이 아니라 몇 자리를 채우라고 말한다", () => {
    const prompt = buildPlanPrompt(base);
    expect(prompt).toContain("속지 2");
    expect(prompt).not.toMatch(/몇 장으로 만들|장수를 정하/);
  });

  it("AI 추천은 Task 4 의 범위와 예약 자리를 함께 준다", () => {
    const prompt = buildPlanPrompt(autoBase);
    expect(prompt).toContain("4~8장");
    expect(prompt).toContain("원본 2장");
    expect(prompt).toContain("마지막 1장");
    expect(prompt).toMatch(/한 번에.*고르/);
  });

  it("원본 그대로 쓸 장이 이미 자리를 차지한다고 알린다", () => {
    expect(buildPlanPrompt(base)).toContain("원본");
  });

  it("말투 메모를 담는다", () => {
    expect(buildPlanPrompt(base)).toContain("친구에게 말하듯 가볍게");
  });

  it("말투 메모가 없으면 그 줄을 넣지 않는다", () => {
    const prompt = buildPlanPrompt({ ...base, toneNote: undefined });
    expect(prompt).not.toContain("말투");
  });

  it("자료에 없는 것을 지어내지 말라고 못 박는다", () => {
    expect(buildPlanPrompt(base)).toMatch(/지어내|없는 사실/);
  });
});

describe("기획", () => {
  it("고정된 자리 수만큼 카드를 만든다", async () => {
    const cards = await planCards(base, {
      generate: async () => ({ cards: [card(1), card(2), card(3)] }),
    });
    expect(cards).toHaveLength(3);
    expect(cards[0]!.role).toBe("cover");
  });

  it("AI 추천은 반환 카드 수로 전체 장수를 역산하고 범위 안이면 받는다", async () => {
    // AI 카드 3 + 원본 2 + 마지막 1 = 전체 6장
    const cards = await planCards(autoBase, {
      generate: async () => ({ cards: [card(1), card(2), card(3)] }),
    });
    expect(cards).toHaveLength(3);
  });

  it("AI 추천 범위를 벗어난 응답은 버린다", async () => {
    // AI 카드 7 + 원본 2 + 마지막 1 = 전체 10장 > 8장
    const cards = await planCards(autoBase, {
      generate: async () => ({ cards: Array.from({ length: 7 }, (_unused, index) => card(index + 1)) }),
    });
    expect(cards).toEqual([]);
  });

  it("주 제공자가 실패하면 OpenAI 예비 결과를 쓴다", async () => {
    const calls: string[] = [];
    const cards = await planCards(
      base,
      { generate: async () => { calls.push(PRIMARY_PLANNING_MODEL); throw new Error("Claude 실패"); } },
      { generate: async () => { calls.push(BACKUP_PLANNING_PROVIDER); return { cards: [card(1), card(2), card(3)] }; } },
    );
    expect(calls).toEqual(["claude-sonnet-5", "openai"]);
    expect(cards).toHaveLength(3);
  });

  it("주 제공자의 범위 밖 응답도 예비 제공자에게 넘긴다", async () => {
    const backup = vi.fn(async () => ({ cards: [card(1), card(2)] }));
    const cards = await planCards(
      autoBase,
      { generate: async () => ({ cards: Array.from({ length: 7 }, (_unused, index) => card(index + 1)) }) },
      { generate: backup },
    );
    expect(backup).toHaveBeenCalledOnce();
    expect(cards).toHaveLength(2); // 2 + 원본 2 + 마지막 1 = 전체 5장
  });

  it("제공자가 던지면 빈 배열을 돌려준다", async () => {
    const cards = await planCards(base, { generate: async () => { throw new Error("모델 없음"); } });
    expect(cards).toEqual([]);
  });

  it("두 제공자가 모두 던져도 빈 배열이다", async () => {
    const cards = await planCards(
      base,
      { generate: async () => { throw new Error("Claude 실패"); } },
      { generate: async () => { throw new Error("OpenAI 실패"); } },
    );
    expect(cards).toEqual([]);
  });

  it("규칙에 안 맞는 응답은 버린다", async () => {
    const cards = await planCards(base, { generate: async () => ({ cards: [{ index: "하나" }] }) as never });
    expect(cards).toEqual([]);
  });

  it("자리보다 많이 오면 잘라낸다", async () => {
    const cards = await planCards(base, {
      generate: async () => ({ cards: Array.from({ length: 10 }, (_unused, index) => card(index + 1)) }),
    });
    expect(cards).toHaveLength(3);
  });

  it("Task 4 에 문제가 있으면 LLM 을 부르지 않는다", async () => {
    const generate = vi.fn(async () => ({ cards: [card(1)] }));
    const cards = await planCards({
      ...base,
      slots: { ...base.slots, issues: ["자리가 모자랍니다."] },
    }, { generate });
    expect(cards).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });
});
