import { describe, expect, it } from "vitest";
import { readLlmMeter, recordFrom, recordLlmUsage, tokensFrom, withLlmMeter } from "../meter";

/**
 * 계량기가 조용히 0을 세는 것이 가장 나쁘다. 화면은 멀쩡하고 장부만 틀린다.
 */

describe("응답에서 토큰 꺼내기", () => {
  it("Anthropic 모양", () => {
    expect(tokensFrom({ usage: { input_tokens: 1200, output_tokens: 300 } })).toEqual({ input: 1200, output: 300 });
  });

  it("OpenAI Chat 모양", () => {
    expect(tokensFrom({ usage: { prompt_tokens: 800, completion_tokens: 200 } })).toEqual({ input: 800, output: 200 });
  });

  it("Google 모양", () => {
    expect(tokensFrom({ usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 100 } }))
      .toEqual({ input: 500, output: 100 });
  });

  /** 못 찾은 것과 0인 것은 다르다. */
  it("칸이 없으면 undefined 다", () => {
    expect(tokensFrom({ content: [] })).toBeUndefined();
    expect(tokensFrom(null)).toBeUndefined();
    expect(tokensFrom("문자열")).toBeUndefined();
  });
});

describe("요청 하나 동안 모으기", () => {
  it("여러 번 부른 것을 더한다", async () => {
    const 읽은값 = await withLlmMeter(async () => {
      recordLlmUsage("claude-sonnet-5", 1_000_000, 0); // $3
      recordLlmUsage("claude-sonnet-5", 0, 1_000_000); // $15
      return readLlmMeter();
    });

    expect(읽은값.metered).toBe(true);
    expect(읽은값.calls).toBe(2);
    expect(읽은값.usd).toBe(18);
    expect(읽은값.inputTokens).toBe(1_000_000);
    expect(읽은값.outputTokens).toBe(1_000_000);
  });

  it("응답을 그대로 넣어도 된다", async () => {
    const 읽은값 = await withLlmMeter(async () => {
      recordFrom("claude-sonnet-5", { usage: { input_tokens: 1500, output_tokens: 600 } });
      return readLlmMeter();
    });

    expect(읽은값.calls).toBe(1);
    expect(읽은값.usd).toBeCloseTo(0.0135, 4);
  });

  /** 비동기 안쪽에서 부른 것도 같은 요청이다. */
  it("몇 겹 아래에서 불러도 모인다", async () => {
    const 읽은값 = await withLlmMeter(async () => {
      await (async () => {
        await Promise.resolve();
        await (async () => recordLlmUsage("claude-sonnet-5", 1_000_000, 0))();
      })();
      return readLlmMeter();
    });

    expect(읽은값.usd).toBe(3);
  });

  /** 두 요청이 서로의 값을 섞으면 한 사람이 남의 몫을 문다. */
  it("요청끼리 섞이지 않는다", async () => {
    const [가, 나] = await Promise.all([
      withLlmMeter(async () => {
        recordLlmUsage("claude-sonnet-5", 1_000_000, 0);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return readLlmMeter();
      }),
      withLlmMeter(async () => {
        recordLlmUsage("claude-sonnet-5", 2_000_000, 0);
        return readLlmMeter();
      }),
    ]);

    expect(가.usd).toBe(3);
    expect(나.usd).toBe(6);
  });
});

describe("계량기 밖", () => {
  /**
   * 아직 감싸지 않은 경로에서 호출이 터지면 안 된다. 대신 **0원인 것과
   * 못 잰 것을 구별**할 수 있어야 한다.
   */
  it("터지지 않고, 못 쟀다고 말한다", () => {
    expect(() => recordLlmUsage("claude-sonnet-5", 1000, 100)).not.toThrow();

    const 읽은값 = readLlmMeter();
    expect(읽은값.metered).toBe(false);
    expect(읽은값.usd).toBe(0);
  });
});
