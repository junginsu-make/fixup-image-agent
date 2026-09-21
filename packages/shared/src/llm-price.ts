/**
 * 글 모델의 값을 **토큰으로** 센다.
 *
 * 지금까지는 어림이었다 — 기획 한 번 $0.014, 그림 읽기 한 장 $0.010 을 못 박아
 * 두고 횟수만 곱했다(`credit.ts`). 그림값이 워낙 커서 티가 안 났지만, 원가
 * 전략의 바닥이 어림이면 그 위에 올린 계산이 전부 어림이 된다.
 *
 * 게다가 그 어림은 **입력 길이를 못 담는다.** 상세페이지 하나를 통째로 읽는
 * 요청과 한 줄짜리 요청이 같은 값으로 계산됐다.
 *
 * ── 단가는 왜 여기 있나 ────────────────────────────────────────
 *
 * 그림 단가는 DB(`model_prices`)에 있는데 글 단가는 없다. 여기에 두는 것은
 * **임시가 아니라 시작**이다 — 값이 바뀌면 이 한 곳만 고치고, 나중에 DB 로
 * 옮길 때도 옮길 자리가 하나뿐이다.
 */

export interface TokenPrice {
  /** 입력 100만 토큰당 달러. */
  inputPerMillion: number;
  /** 출력 100만 토큰당 달러. */
  outputPerMillion: number;
}

/**
 * 공표 단가. **2026-09-17 에 각 업체 공식 문서로 대조했다.**
 *
 * 그 전 표는 2026-09-10 에 「청구서로 대조한 값이 아니다」라고 적어 둔
 * 어림이었고, **네 줄 중 셋이 틀려 있었다.** 그 경고가 맞았다.
 *
 * **정산은 실제로 잰 토큰을 쓴다**(`meter.ts` → `llmUsdFromTokens`). 그래서
 * 이 표가 곧 청구 금액이다.
 *
 * 값이 바뀌면 **여기만** 고친다. `credit.ts` 의 어림값도 이 표에서 나온
 * 것이므로 함께 본다.
 */
export const LLM_PRICES: Record<string, TokenPrice> = {
  /*
    ── Anthropic ────────────────────────────────────────────
    2026-09-17 에 공식 문서로 대조했다. 넷 중 셋이 틀려 있었다.
  */
  // 2026-08-10 에 도입가가 영구 확정됐다. $3/$15 인상은 취소됐는데 표가
  // 그대로였다 — 원가를 50% 비싸게 세고 있었다.
  "claude-sonnet-5": { inputPerMillion: 2, outputPerMillion: 10 },
  "claude-fable-5": { inputPerMillion: 10, outputPerMillion: 50 },
  // 세 배 비싸게 적혀 있었다.
  "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },

  /* ── OpenAI ─────────────────────────────────────────────── */
  "gpt-6-astra": { inputPerMillion: 10, outputPerMillion: 50 },
  // **싸게** 적혀 있었다($3/$15). 이쪽이 더 위험하다 — 원가를 싸게 보면
  // 요금을 그만큼 낮게 잡는다. 2026-11-21 까지의 할인가다.
  "gpt-5.6-sol": { inputPerMillion: 4, outputPerMillion: 20 },
  "gpt-5.6-terra": { inputPerMillion: 2, outputPerMillion: 12 },
  "gpt-5.6-luna": { inputPerMillion: 0.2, outputPerMillion: 1.2 },
};

/**
 * 모르는 모델의 값. **아는 것 중 가장 비싼 값을 쓴다.**
 *
 * 적게 잡는 쪽이 위험하다 — 원가를 실제보다 싸게 보면 요금을 그만큼 낮게
 * 잡는다. 그림값이 `credit-cost.ts` 에서 같은 판단을 한다.
 */
export function priceOf(model: string): TokenPrice {
  const known = LLM_PRICES[model];
  if (known) return known;

  // 이름이 조금 다른 경우(날짜 꼬리표 등)를 먼저 본다.
  const prefixed = Object.keys(LLM_PRICES).find((id) => model.startsWith(id));
  if (prefixed) return LLM_PRICES[prefixed]!;

  const all = Object.values(LLM_PRICES);
  return {
    inputPerMillion: Math.max(...all.map((price) => price.inputPerMillion)),
    outputPerMillion: Math.max(...all.map((price) => price.outputPerMillion)),
  };
}

/** 이번 호출에 든 돈. */
export function llmUsdFromTokens(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceOf(model);
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);
  const usd = (input * price.inputPerMillion + output * price.outputPerMillion) / 1_000_000;

  // 소수 여섯 자리까지 남긴다. 한 번은 $0.0001 이라도 수천 번이면 보인다.
  return Number(usd.toFixed(6));
}
