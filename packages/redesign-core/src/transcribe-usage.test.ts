import { describe, expect, it, vi } from "vitest";
import { transcribeStrips } from "./transcribe";
import type { LlmUsage } from "./usage";

/**
 * **전사가 쓴 돈이 장부에 한 줄도 없었다**(F-7-9).
 *
 * 설계 §14.5: 「전사 사용량 **계량·한도 없음** | 수정 | W3/W8 / 성공·실패
 * meter 와 limit」.
 * 설계 §7.2: 「기획·레퍼런스 분석·**전사** 성공/실패를 LLM meter 에 연결한다.
 * 이미지 크레딧 0 이어도 원가 기록은 남긴다.」
 *
 * 전사는 **상세페이지를 통째로 잘라 글 모델에 먹인다.** 스트립 마흔 장까지,
 * 한 배치에 여덟 장씩이므로 한 번 돌면 호출이 다섯 번까지 간다. 그런데
 * `transcribeStrips` 는 토큰을 **받아 적을 자리조차 없었다** — `onUsage` 가
 * 아예 없다.
 *
 * 받아 적을 자리가 없으면 제공자가 준 숫자는 읽히지 않고 버려지고, 운영
 * 원가에서 전사는 **$0 으로 보인다.**
 */

const 스트립 = { base64: "AAA", mimeType: "image/jpeg", yStartRatio: 0, yEndRatio: 1 };

const 답한다 = (body: unknown) =>
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
  }));

describe("전사가 쓴 토큰을 받아 적는다", () => {
  it("**OpenAI 가 적은 토큰을 보고한다**", async () => {
    답한다({
      output_text: JSON.stringify({ transcript: "### 구간 1", lastSectionType: "후킹" }),
      usage: { input_tokens: 4200, output_tokens: 850 },
    });
    const 받은것: Array<{ model: string; inputTokens: number; outputTokens: number }> = [];

    try {
      await transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "openai", openaiKey: "sk-test",
        onUsage: (usage: LlmUsage) => 받은것.push(usage),
      } as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(받은것).toHaveLength(1);
    expect(받은것[0]!.inputTokens).toBe(4200);
    expect(받은것[0]!.outputTokens).toBe(850);
    // 어느 모델이 썼는지가 없으면 단가를 못 고른다.
    expect(받은것[0]!.model).toBeTruthy();
  });

  it("**Google 이 적은 토큰도 보고한다** — 이름이 다르다", async () => {
    답한다({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ transcript: "### 구간 1" }) }] } }],
      usageMetadata: { promptTokenCount: 5100, candidatesTokenCount: 640 },
    });
    const 받은것: Array<{ model: string; inputTokens: number; outputTokens: number }> = [];

    try {
      await transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "google", googleKey: "g-test",
        onUsage: (usage: LlmUsage) => 받은것.push(usage),
      } as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(받은것).toHaveLength(1);
    expect(받은것[0]!.inputTokens).toBe(5100);
    expect(받은것[0]!.outputTokens).toBe(640);
  });

  /**
   * **못 쟀으면 0 이라고 하지 않는다.** 0원으로 적히면 「안 썼다」와 「못 쟀다」가
   * 장부에서 같은 모양이 된다.
   */
  it("**제공자가 토큰을 안 주면 아무 말도 안 한다**", async () => {
    답한다({ output_text: JSON.stringify({ transcript: "### 구간 1" }) });
    const 받은것: unknown[] = [];

    try {
      await transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "openai", openaiKey: "sk-test",
        onUsage: (usage: unknown) => 받은것.push(usage),
      } as never);
    } finally {
      vi.unstubAllGlobals();
    }

    expect(받은것).toHaveLength(0);
  });
});

/**
 * **끝까지 못 쓴 전사를 온전한 것처럼 쓰지 않는다**(F-7-1).
 *
 * 같은 꾸러미의 분석 호출은 잘림을 보는데 전사는 안 봤다. 잘리면 JSON 이
 * 깨져 화면이 그 배치를 「[구간 전사 실패]」 자리표시로 바꾸는데, **안 보면
 * 조각난 전사가 온전한 것처럼** 기획으로 흘러간다.
 */
describe("잘린 전사를 온전한 것처럼 쓰지 않는다", () => {
  /**
   * **본문이 멀쩡해 보여도 표시를 믿는다.**
   *
   * 처음 시험은 몸통을 깨진 JSON 으로 줬는데, 그러면 **검사를 지워도 파싱이
   * 먼저 터져** 시험이 빨개졌다 — 검사가 있는지 없는지를 가르지 못했다
   * (2026-09-21 변이에서 드러남). 파싱되는 몸통으로 준다.
   */
  it("**OpenAI 가 잘렸다고 하면 던진다**", async () => {
    답한다({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: JSON.stringify({ transcript: "### 구간 1 앞부분만" }),
    });

    try {
      await expect(transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "openai", openaiKey: "sk-test",
      } as never)).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**Google 이 정상(STOP)이 아니면 던진다**", async () => {
    답한다({
      candidates: [{
        finishReason: "MAX_TOKENS",
        content: { parts: [{ text: JSON.stringify({ transcript: "앞부분만" }) }] },
      }],
    });

    try {
      await expect(transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "google", googleKey: "g-test",
      } as never)).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**모델 이름을 사용자 문구에 넣지 않는다**", async () => {
    답한다({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output_text: JSON.stringify({ transcript: "앞부분만" }),
    });

    try {
      const 오류 = await transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "openai", openaiKey: "sk-test",
      } as never).catch((e: unknown) => e) as Error;

      for (const 조각 of ["gpt-", "gemini", "preview"]) {
        expect(오류.message.toLowerCase()).not.toContain(조각);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**정상 응답은 그대로 지나간다**", async () => {
    답한다({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ transcript: "### 구간 1" }) }] } }],
    });

    try {
      const result = await transcribeStrips({
        strips: [스트립], batchIndex: 0, batchCount: 1,
        provider: "google", googleKey: "g-test",
      } as never);

      expect(result.transcript).toContain("구간 1");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

