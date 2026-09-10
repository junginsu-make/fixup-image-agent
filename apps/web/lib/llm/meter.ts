import { AsyncLocalStorage } from "node:async_hooks";
import { llmUsdFromTokens } from "@fixup/shared";

/**
 * 이 요청에서 글 모델에 **실제로 쓴 돈**을 모은다.
 *
 * ── 왜 인자로 안 넘기나 ────────────────────────────────────────
 *
 * 글 모델 호출은 열한 군데에 흩어져 있고, 대부분 서너 겹 아래에서 일어난다
 * (라우트 → 서비스 → 제공자). 토큰을 위로 되돌리려면 그 사이의 모든
 * 시그니처와 반환형을 고쳐야 하고, **한 곳만 빠뜨려도 그 경로는 조용히 0원**이
 * 된다. 값을 못 세는 것보다 **못 센 줄 모르는 것**이 나쁘다.
 *
 * 그래서 요청 단위 저장소에 담는다. 호출하는 쪽은 자기가 계량되는 줄 몰라도
 * 되고, 라우트는 끝에서 한 번 읽는다.
 *
 * ── 계량기가 없으면 ────────────────────────────────────────────
 *
 * **조용히 버린다.** 아직 감싸지 않은 경로(배치 작업·워커)에서 호출이 터지면
 * 안 된다. 대신 `readLlmMeter` 가 `metered: false` 를 함께 돌려주므로, 값이
 * 0인 것과 **계량기가 없어서 0인 것**을 구별할 수 있다.
 */

interface Meter {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

const storage = new AsyncLocalStorage<Meter>();

/** 이 안에서 일어난 글 모델 호출을 모은다. */
export function withLlmMeter<T>(run: () => Promise<T>): Promise<T> {
  return storage.run({ usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 }, run);
}

/** 호출 한 번을 적는다. 제공자가 부른다. */
export function recordLlmUsage(model: string, inputTokens: number, outputTokens: number): void {
  const meter = storage.getStore();
  if (!meter) return;

  meter.usd = Number((meter.usd + llmUsdFromTokens(model, inputTokens, outputTokens)).toFixed(6));
  meter.inputTokens += Math.max(0, inputTokens);
  meter.outputTokens += Math.max(0, outputTokens);
  meter.calls += 1;
}

export interface LlmMeterReading {
  /** 계량기 안에서 읽었는가. 거짓이면 아래 숫자는 「모름」이지 「0원」이 아니다. */
  metered: boolean;
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

export function readLlmMeter(): LlmMeterReading {
  const meter = storage.getStore();
  if (!meter) return { metered: false, usd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  return { metered: true, ...meter };
}

/**
 * SDK 응답에서 토큰 수를 꺼낸다.
 *
 * 업체마다 이름이 다르다 — Anthropic 은 `usage.input_tokens`, OpenAI 는
 * `usage.input_tokens`(Responses) 또는 `usage.prompt_tokens`(Chat), Google 은
 * `usageMetadata.promptTokenCount` 다. **못 찾으면 0 이 아니라 못 찾은 것**이라,
 * 부르는 쪽이 그 사실을 알 수 있게 `undefined` 를 돌려준다.
 */
export function tokensFrom(response: unknown): { input: number; output: number } | undefined {
  if (!response || typeof response !== "object") return undefined;
  const record = response as Record<string, unknown>;

  const usage = (record.usage ?? record.usageMetadata) as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return undefined;

  const pick = (...names: string[]): number | undefined => {
    for (const name of names) {
      const value = usage[name];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
  };

  const input = pick("input_tokens", "prompt_tokens", "promptTokenCount");
  const output = pick("output_tokens", "completion_tokens", "candidatesTokenCount");
  if (input === undefined && output === undefined) return undefined;

  return { input: input ?? 0, output: output ?? 0 };
}

/**
 * 받은 응답에서 토큰을 꺼내 적는다.
 *
 * 호출식을 감싸지 않고 **받은 다음 한 줄**로 두는 이유는, 감싸려면 여러 줄짜리
 * 인자 뭉치의 끝을 찾아 괄호를 더 닫아야 해서다. 열한 곳에서 그러다 한 곳만
 * 어긋나면 그 파일이 통째로 안 붙는다.
 */
export function recordFrom(model: string, response: unknown): void {
  const tokens = tokensFrom(response);
  if (tokens) recordLlmUsage(model, tokens.input, tokens.output);
}

/**
 * 부르고, 재고, 그대로 돌려준다.
 *
 * 호출 자리마다 세 줄씩 붙이지 않으려고 감싼다. **응답은 손대지 않는다** —
 * 계량은 곁다리고, 값을 바꾸면 이 함수가 원인이 되는 버그가 생긴다.
 */
export async function metered<T>(model: string, call: () => Promise<T>): Promise<T> {
  const response = await call();
  const tokens = tokensFrom(response);
  if (tokens) recordLlmUsage(model, tokens.input, tokens.output);
  return response;
}
