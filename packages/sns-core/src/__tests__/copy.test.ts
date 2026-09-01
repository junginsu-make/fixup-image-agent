import { describe, expect, it, vi } from "vitest";
import {
  BACKUP_COPY_PROVIDER,
  PRIMARY_COPY_MODEL,
  buildCopyPrompt,
  writeCopy,
} from "../copy";

const base = {
  sourceText: "AI 자동화는 단일 업무부터 시작해야 한다.",
  plans: [
    { index: 1, role: "cover" as const, intent: "핵심 훅", visualBrief: "표지 장면" },
    { index: 2, role: "body" as const, intent: "첫 단계", visualBrief: "설명 장면" },
  ],
  toneNote: "친구에게 설명하듯",
  language: "ko" as const,
};

describe("원고 프롬프트", () => {
  it("사용자가 고른 언어를 지정한다", () => {
    expect(buildCopyPrompt({ ...base, language: "en" })).toContain("English");
    expect(buildCopyPrompt({ ...base, language: "ko" })).toContain("한국어");
    expect(buildCopyPrompt({ ...base, language: "ja" })).toContain("日本語");
    expect(buildCopyPrompt({ ...base, language: "zh" })).toContain("中文");
  });

  it("한국어 자료여도 영어 출력을 지시한다", () => {
    const prompt = buildCopyPrompt({ ...base, language: "en" });
    expect(prompt).toContain("English");
    expect(prompt).toContain(base.sourceText);
  });

  it("숫자 상한 없이 읽기 좋은 양을 판단하라고 한다", () => {
    const prompt = buildCopyPrompt(base);
    expect(prompt).toContain("카드 하나가 읽기 벅차지 않게 쓰세요.");
    expect(prompt).toContain("제목은 한눈에 들어오는 길이로, 본문은 요점만.");
    expect(prompt).toContain("내용이 꼭 필요해서 길어지면 줄이지 마세요");
    expect(prompt).not.toMatch(/60자|200자|30자|40자/);
  });

  it("자료에 없는 것을 지어내지 말라고 못 박는다", () => {
    expect(buildCopyPrompt(base)).toMatch(/지어내|없는 사실/);
  });
});

describe("원고 쓰기", () => {
  it("카드마다 제목을 채운다", async () => {
    const result = await writeCopy(base, {
      generate: async () => ({ cards: [{ index: 1, headline: "제목", body: "본문" }] }),
    });
    expect(result.copies[0]!.headline).toBe("제목");
    expect(result.issues).toEqual([]);
  });

  it("긴 원고를 자르지 않고 그대로 돌려준다", async () => {
    const result = await writeCopy(base, {
      generate: async () => ({ cards: [{
        index: 1,
        headline: "가".repeat(100),
        body: "나".repeat(300),
        accent: "다".repeat(50),
        footnote: "라".repeat(70),
      }] }),
    });
    expect(result.copies[0]!.headline).toHaveLength(100);
    expect(result.copies[0]!.body).toHaveLength(300);
    expect(result.copies[0]!.accent).toHaveLength(50);
    expect(result.copies[0]!.footnote).toHaveLength(70);
  });

  it("주 모델 실패 후 OpenAI 예비가 성공하면 원고와 경고를 돌려준다", async () => {
    const result = await writeCopy(
      base,
      { generate: async () => { throw new Error("Claude 원고 실패"); } },
      { generate: async () => ({ cards: [{ index: 1, headline: "Backup" }] }) },
    );
    expect(result.copies[0]!.headline).toBe("Backup");
    expect(result.issues).toEqual(["주 모델이 실패해 OpenAI 예비로 원고를 썼습니다: Claude 원고 실패"]);
  });

  it("주 모델이 실패하고 예비가 없으면 이유를 남긴다", async () => {
    const result = await writeCopy(base, {
      generate: async () => { throw new Error("Claude 원고 실패"); },
    });
    expect(result.copies).toEqual([]);
    expect(result.issues).toEqual([
      "주 모델 원고 실패: Claude 원고 실패",
      "OpenAI 예비 원고 제공자가 설정되지 않았습니다.",
    ]);
  });

  it("예비도 실패하면 두 이유를 모두 남긴다", async () => {
    const result = await writeCopy(
      base,
      { generate: async () => { throw new Error("Claude 원고 실패"); } },
      { generate: async () => { throw new Error("OpenAI 원고 실패"); } },
    );
    expect(result.copies).toEqual([]);
    expect(result.issues).toEqual([
      "주 모델 원고 실패: Claude 원고 실패",
      "OpenAI 예비 원고도 실패했습니다: OpenAI 원고 실패",
    ]);
  });

  it("규칙에 안 맞는 응답도 이유를 남긴다", async () => {
    const result = await writeCopy(base, {
      generate: async () => ({ cards: [{ index: "하나" }] }) as never,
    });
    expect(result.copies).toEqual([]);
    expect(result.issues[0]).toContain("주 모델 원고 실패");
  });

  it("기획이 없으면 LLM 을 부르지 않고 이유를 남긴다", async () => {
    const generate = vi.fn(async () => ({ cards: [{ index: 1, headline: "x" }] }));
    const result = await writeCopy({ ...base, plans: [] }, { generate });
    expect(result).toEqual({ copies: [], issues: ["원고를 쓸 카드 기획이 없습니다."] });
    expect(generate).not.toHaveBeenCalled();
  });

  it("주 모델 상수는 claude-sonnet-5 이고 예비는 OpenAI 다", () => {
    expect(PRIMARY_COPY_MODEL).toBe("claude-sonnet-5");
    expect(BACKUP_COPY_PROVIDER).toBe("openai");
  });
});
