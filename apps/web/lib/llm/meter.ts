import { AsyncLocalStorage } from "node:async_hooks";
import { llmUsdFromTokens } from "@fixup/shared";
import { providerOfModel } from "../ai-cost/keys";
import { flushAiCostWrites, writeAiCostRow, type AiCaller, type AiCostEntry } from "../ai-cost/write";

export type { AiCaller, AiCostEntry } from "../ai-cost/write";

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
 * ── 호출마다 한 줄(설계 2026-09-30 §3.4) ─────────────────────────
 *
 * 같은 저장소에 **누구의 무슨 호출인가**(`AiCaller`)도 싣는다. 라우트 입구가
 * `withLlmMeter` 로 저장소를 열고, 예약(`reserveAiUsage`)이 성공하면 `bindAiCaller` 로
 * 채운다. 그러면 `recordLlmUsage`·`recordAiCost` 가 공급자를 부를 때마다
 * `ai_cost_events` 에 한 줄을 쓴다 — 공급자 생성 함수의 인자는 그대로다.
 *
 * ── 계량기가 없으면 ────────────────────────────────────────────
 *
 * 합산은 **조용히 버린다.** 아직 감싸지 않은 경로에서 호출이 터지면 안 된다. 대신
 * `readLlmMeter` 가 `metered: false` 를 함께 돌려주므로, 값이 0인 것과 **계량기가 없어서
 * 0인 것**을 구별할 수 있다. **비용 한 줄은 버리지 않는다** — 문맥 없이(`unbound`) 적는다.
 */

interface Meter {
  usd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  caller?: AiCaller;
  /** 이 요청에서 시작한 비용 쓰기. 끝나기 전에 기다린다(`flushAiCostWrites`). */
  pending: Promise<void>[];
}

const storage = new AsyncLocalStorage<Meter>();

/**
 * 이 안에서 일어난 글 모델 호출을 모으고, 비용 쓰기를 끝까지 기다린다.
 *
 * **겹쳐 열면 바깥의 문맥을 물려받는다.** 쉬운 만들기는 안쪽에서 포스터 라우트를 부르고,
 * 칸 읽기는 라우트 안에서 계량기를 한 번 더 연다. 합산은 안쪽 것이 따로 세지만, 누구의
 * 호출인지는 같다.
 */
export async function withLlmMeter<T>(run: () => Promise<T>): Promise<T> {
  const outer = storage.getStore();
  const meter: Meter = { usd: 0, inputTokens: 0, outputTokens: 0, calls: 0, caller: outer?.caller, pending: [] };
  try {
    return await storage.run(meter, run);
  } finally {
    await flushAiCostWrites(meter.pending);
  }
}

/**
 * **이 요청이 누구의 무슨 작업인가.** 예약이 성공하면 `reserveAiUsage` 가 부른다.
 * 예약하지 않는 세 자리(카드뉴스·포스터 상태 조회, 관리자 지식 올리기)는 라우트가 직접 부른다.
 * 저장소가 없으면 아무것도 안 한다 — 그 길의 비용은 `unbound` 로 적힌다.
 */
export function bindAiCaller(caller: AiCaller): void {
  const meter = storage.getStore();
  if (meter) meter.caller = { ...caller };
}

export function currentAiCaller(): AiCaller | undefined {
  return storage.getStore()?.caller;
}

/** 비용 한 줄. 그림·웹검색·Apify 자리가 부른다. 글 모델은 `recordLlmUsage` 가 대신 부른다. */
export function recordAiCost(entry: AiCostEntry): void {
  const meter = storage.getStore();
  const write = writeAiCostRow(meter?.caller, entry);
  if (meter) meter.pending.push(write);
}

/** 호출 한 번을 적는다. 제공자가 부른다. **비용 한 줄도 여기서 쓴다** — 모듈마다 따로 감싸지 않는다. */
export function recordLlmUsage(model: string, inputTokens: number, outputTokens: number): void {
  const usd = llmUsdFromTokens(model, inputTokens, outputTokens);
  recordAiCost({ provider: providerOfModel(model), model, inputTokens, outputTokens, usd, basis: "tokens" });

  const meter = storage.getStore();
  if (!meter) return;

  meter.usd = Number((meter.usd + usd).toFixed(6));
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
  return { metered: true, usd: meter.usd, inputTokens: meter.inputTokens, outputTokens: meter.outputTokens, calls: meter.calls };
}

/**
 * **정산에 실을 글 모델 원가**(설계 2026-09-30 §3.1).
 *
 * 못 쟀으면 금액을 비운다. 0 을 적으면 `finalizeAiUsage` 가 「정말 0원」으로
 * 남기고(`cost_state='recorded'`), 되돌릴 근거가 없다. 계량기 밖이거나 부른
 * 것이 없으면 `llmUsd` 를 빼서 「모름」으로 남긴다.
 */
export function llmSettleCost(): { model: string; billableImages: number; llmUsd?: number } {
  const meter = readLlmMeter();
  return {
    model: "",
    billableImages: 0,
    ...(meter.metered && meter.calls > 0 ? { llmUsd: meter.usd } : {}),
  };
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
