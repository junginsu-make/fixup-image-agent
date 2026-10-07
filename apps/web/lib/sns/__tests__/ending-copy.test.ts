import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment, CopyProvider, PlanProvider } from "@fixup/sns-core";
import type { SnsProjectRecord } from "../../../app/api/sns/projects/project-service";
import { createActualPlanningFlow, type ActualPlanningProviders } from "../actual-flow";
import { endingCopyPrompt } from "../ending-copy";
import { readLlmMeter, recordLlmUsage, withLlmMeter } from "../../llm/meter";

/**
 * **카드뉴스 마지막 장 원고를 내용에 맞게 쓴다**(2026-10-07 Task 5 (a)).
 *
 * 일반 화면은 마지막 장에 「핵심 내용을 기억해 주세요」 · 빈 본문 · 고정 그림 방향을 넣었다(운영 4/4).
 * 원고가 나온 직후 앞 장들을 정리해 쓰고, 못 쓰면 지금 고정 문구로 물러난다(화면이 멈추지 않게).
 */
const FIXED_HEADLINE = "핵심 내용을 기억해 주세요";

function project(topic: string, attachments: Attachment[] = []): SnsProjectRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    title: "엔딩", status: "draft", ratio: "4:5", language: "ko", modelId: "nano-banana",
    cardCountMode: "fixed", cardCount: 4,
    data: { source: { kind: "text", text: `${topic} 이야기` }, attachments },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function providers(topic: string, ending: Partial<ActualPlanningProviders> = {}): ActualPlanningProviders {
  const planning: PlanProvider = { generate: async () => ({
    total: 4,
    cards: [
      { index: 1, role: "cover", intent: `${topic} 소개`, visualBrief: `${topic} 표지 장면` },
      { index: 2, role: "body", intent: `${topic} 하나`, visualBrief: `${topic} 속지 장면 1` },
      { index: 3, role: "body", intent: `${topic} 둘`, visualBrief: `${topic} 속지 장면 2` },
    ],
  }) };
  const copy: CopyProvider = { generate: async () => ({ cards: [
    { index: 1, headline: `${topic} 시작` },
    { index: 2, headline: `${topic} 고르기`, body: `${topic}는 신선한 것을 고릅니다` },
    { index: 3, headline: `${topic} 보관`, body: `${topic}는 서늘한 곳에 둡니다` },
  ] }) };
  return { planningPrimary: planning, planningBackup: planning, copyPrimary: copy, copyBackup: copy, ...ending };
}

const resolver = {
  ingestYoutube: async () => ({ segments: [] }),
  ingestWeb: async () => ({ segments: [] }),
  research: async () => ({ text: "", citations: [] }),
};

/** 받은 프롬프트의 앞 장 제목으로 정리 장을 쓰는 가짜 제공자. */
const echoEnding: CopyProvider = {
  generate: async (prompt: string) => {
    const topic = /1\. (\S+) 시작/.exec(prompt)?.[1] ?? "모름";
    return {
      headline: `${topic} 한눈에 정리`,
      body: `· ${topic} 고르기\n· ${topic} 보관`,
      intent: `${topic} 핵심을 다시 묶는다`,
      visualBrief: `${topic} 소품을 모아 둔 정리 장면`,
    };
  },
};

const fails: CopyProvider = { generate: async () => { throw new Error("응답을 받지 못했습니다."); } };

const endingOf = async (topic: string, ending: Partial<ActualPlanningProviders>, attachments: Attachment[] = []) =>
  (await createActualPlanningFlow(project(topic, attachments), providers(topic, ending), resolver)).cards;

let warns: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warns = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => warns.mockRestore());

describe("마지막 장 원고", () => {
  it("앞 장 내용에 따라 다르게 쓴다 — 원고 · 뜻 · 그림 방향 모두", async () => {
    const coffee = (await endingOf("커피", { endingPrimary: echoEnding, endingBackup: fails }))[3]!;
    const tea = (await endingOf("녹차", { endingPrimary: echoEnding, endingBackup: fails }))[3]!;

    expect(coffee.role).toBe("ending");
    expect(coffee.kind).toBe("generated");
    expect(coffee.copy).toEqual({ index: 4, headline: "커피 한눈에 정리", body: "· 커피 고르기\n· 커피 보관" });
    expect(coffee.plan).toEqual({ index: 4, role: "body", intent: "커피 핵심을 다시 묶는다", visualBrief: "커피 소품을 모아 둔 정리 장면" });
    expect(tea.copy.headline).toBe("녹차 한눈에 정리");
    expect(tea.plan?.visualBrief).toBe("녹차 소품을 모아 둔 정리 장면");
  });

  it("앞 장의 제목 · 본문 · 그림 방향을 보고 쓴다", async () => {
    const prompts: string[] = [];
    await endingOf("커피", { endingPrimary: { generate: async (prompt: string) => { prompts.push(prompt); return echoEnding.generate(prompt); } } });

    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("1. 커피 시작");
    expect(prompts[0]).toContain("2. 커피 고르기 / 커피는 신선한 것을 고릅니다");
    expect(prompts[0]).toContain("커피 속지 장면 2");
    expect(prompts[0]).toContain("한국어");
  });

  it("주 모델이 실패하면 예비로 쓴다", async () => {
    const ending = (await endingOf("커피", { endingPrimary: fails, endingBackup: echoEnding }))[3]!;
    expect(ending.copy.headline).toBe("커피 한눈에 정리");
  });

  it("둘 다 실패하면 지금 고정 문구로 물러나고 흐름은 이어진다", async () => {
    const cards = await endingOf("커피", { endingPrimary: fails, endingBackup: fails });
    expect(cards).toHaveLength(4);
    expect(cards[3]!.copy).toEqual({ index: 4, headline: FIXED_HEADLINE });
    expect(cards[3]!.plan).toEqual({ index: 4, role: "body", intent: "핵심 내용을 마무리한다", visualBrief: "시리즈를 마무리하는 엔딩 장면" });
    expect(cards.slice(0, 3).map((card) => card.copy.headline)).toEqual(["커피 시작", "커피 고르기", "커피 보관"]);
  });

  it("빈 칸이 있는 답은 쓰지 않는다", async () => {
    const empty: CopyProvider = { generate: async () => ({ headline: "정리", body: " ", intent: "뜻", visualBrief: "장면" }) };
    const fallback = (await endingOf("커피", { endingPrimary: empty, endingBackup: empty }))[3]!;
    expect(fallback.copy.headline).toBe(FIXED_HEADLINE);
    const backup = (await endingOf("커피", { endingPrimary: empty, endingBackup: echoEnding }))[3]!;
    expect(backup.copy.headline).toBe("커피 한눈에 정리");
  });

  it("제한 시간 안에 못 쓰면 기다리지 않고 고정 문구로 간다", async () => {
    vi.useFakeTimers();
    try {
      const hang: CopyProvider = { generate: () => new Promise(() => {}) };
      const pending = endingOf("커피", { endingPrimary: hang, endingBackup: hang });
      await vi.advanceTimersByTimeAsync(60_000);
      const cards = await pending;
      expect(cards[3]!.copy.headline).toBe(FIXED_HEADLINE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("제공자를 안 주면 지금처럼 고정 문구다", async () => {
    const cards = await endingOf("커피", {});
    expect(cards[3]!.copy).toEqual({ index: 4, headline: FIXED_HEADLINE });
  });

  it("사용자가 마지막 장 그림을 올렸으면 원고를 쓰지 않는다", async () => {
    const generate = vi.fn(echoEnding.generate);
    const endingImage: Attachment = { id: "e", kind: "ending", assetPath: "user/e.png", url: "https://example.com/e.png" };
    const cards = await endingOf("커피", { endingPrimary: { generate } }, [endingImage]);
    expect(generate).not.toHaveBeenCalled();
    expect(cards[3]!.kind).toBe("ending_image");
  });

  it("마지막 장 호출의 값도 기획 요청의 계량기에 실린다", async () => {
    const metered: CopyProvider = { generate: async (prompt: string) => {
      recordLlmUsage("claude-sonnet-5", 100, 50);
      return echoEnding.generate(prompt);
    } };
    const calls = await withLlmMeter(async () => {
      await endingOf("커피", { endingPrimary: metered });
      return readLlmMeter().calls;
    });
    expect(calls).toBe(1);
  });
});

describe("마지막 장 프롬프트", () => {
  it("화면 · 프롬프트 글에 줄표를 쓰지 않는다", () => {
    const prompt = endingCopyPrompt({
      cards: [{ index: 1, kind: "generated", role: "cover", copy: { index: 1, headline: "제목" }, status: "pending" }],
      language: "ko",
      toneNote: "친근하게",
    });
    expect(prompt).not.toContain("—");
    expect(prompt).toContain("말투: 친근하게");
  });
});

describe("운영 제공자 배선", () => {
  const source = readFileSync(new URL("../providers.ts", import.meta.url), "utf8");

  it("마지막 장도 다른 기획 호출처럼 가린 구조화 제공자(계량하는 자리)로 부른다", () => {
    expect(source).toMatch(/endingPrimary: maskedStructured\("주 마지막 장", new AnthropicStructuredProvider\(anthropic, anthropicModel, ENDING_SPEC\)\)/);
    expect(source).toMatch(/endingBackup: maskedStructured\("예비 마지막 장", new OpenAIStructuredProvider\(openai, openaiTextModel, ENDING_SPEC\)\)/);
  });
});
