import { describe, expect, it } from "vitest";
import { LLM_PRICES, llmUsdFromTokens, priceOf } from "../llm-price";
import { LLM_PLAN_USD } from "../credit";

/**
 * 글 모델 값은 **원가 전략의 바닥**이다. 여기가 틀리면 그 위에 올린 요금이
 * 전부 틀린다. 그런데 틀려도 화면은 멀쩡히 돌아간다.
 */

describe("토큰으로 값 매기기", () => {
  it("입력과 출력에 다른 값을 매긴다", () => {
    // 출력이 다섯 배 비싸다. 같은 토큰 수라도 값이 다르다.
    const 입력만 = llmUsdFromTokens("claude-sonnet-5", 1_000_000, 0);
    const 출력만 = llmUsdFromTokens("claude-sonnet-5", 0, 1_000_000);

    expect(입력만).toBe(3);
    expect(출력만).toBe(15);
  });

  it("100만 토큰을 기준으로 비례한다", () => {
    expect(llmUsdFromTokens("claude-sonnet-5", 1500, 600)).toBeCloseTo(0.0045 + 0.009, 6);
  });

  it("음수는 0으로 본다", () => {
    expect(llmUsdFromTokens("claude-sonnet-5", -100, -100)).toBe(0);
  });
});

describe("모르는 모델", () => {
  /** 적게 잡는 쪽이 위험하다 — 원가를 싸게 보면 요금을 그만큼 낮게 잡는다. */
  it("아는 것 중 가장 비싼 값을 쓴다", () => {
    const 모름 = priceOf("어디서-온-모델-9");
    const 최고입력 = Math.max(...Object.values(LLM_PRICES).map((price) => price.inputPerMillion));
    const 최고출력 = Math.max(...Object.values(LLM_PRICES).map((price) => price.outputPerMillion));

    expect(모름.inputPerMillion).toBe(최고입력);
    expect(모름.outputPerMillion).toBe(최고출력);
  });

  it("날짜 꼬리표가 붙어도 같은 모델로 본다", () => {
    expect(priceOf("claude-sonnet-5-20260101")).toEqual(LLM_PRICES["claude-sonnet-5"]);
  });
});

describe("옛 어림값과 견주기", () => {
  /**
   * 어림값은 「입력 1500 + 출력 600」을 가정했다. 실측이 그 언저리인지
   * 확인해 둔다 — 크게 어긋나면 지금까지의 계산이 크게 틀렸다는 뜻이다.
   */
  it("가정한 토큰 수를 넣으면 옛 어림값 언저리가 나온다", () => {
    const 실측식 = llmUsdFromTokens("claude-sonnet-5", 1500, 600); // $0.0135
    // 어림값($0.014)과 10% 안쪽이면 지금까지의 계산이 크게 틀리지는 않았다는 뜻이다.
    expect(Math.abs(실측식 - LLM_PLAN_USD) / LLM_PLAN_USD).toBeLessThan(0.1);
  });
});
