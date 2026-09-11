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
 * 공표 단가. **2026-09-10 기준이고 청구서로 대조한 값이 아니다.**
 *
 * 대조하기 전까지는 이 주석을 지우지 않는다. 「어디까지 믿을 값인가」를
 * 모르면 이 숫자를 쓰는 쪽이 과신한다.
 */
export const LLM_PRICES: Record<string, TokenPrice> = {
  // Generation-time knowledge retrieval, checked 2026-09-11:
  // https://developers.openai.com/api/docs/models/text-embedding-3-small
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-5": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
  "gpt-5.6-sol": { inputPerMillion: 3, outputPerMillion: 15 },
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
