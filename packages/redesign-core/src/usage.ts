/**
 * **업체 응답에서 토큰 수를 꺼낸다.**
 *
 * OpenAI 는 `usage.input_tokens`, Google 은 `usageMetadata.promptTokenCount` 다.
 * 같은 값을 다른 이름으로 준다.
 *
 * ── 왜 따로 두나 ────────────────────────────────────────────
 *
 * 기획(`generate.ts`)만 이 일을 알고 있었다. 전사(`transcribe.ts`)는 토큰을
 * **받아 적을 자리조차 없어서** 운영 원가에서 $0 으로 보였다(F-7-9). 같은 일을
 * 두 벌로 적으면 한쪽만 고치는 날 조용히 갈린다.
 */

export type LlmUsage = { model: string; inputTokens: number; outputTokens: number };
export type UsageReporter = (usage: LlmUsage) => void;

/**
 * **못 찾으면 0 이 아니라 아무 말도 하지 않는다** — 0원으로 적히면 「안 썼다」와
 * 「못 쟀다」가 장부에서 같은 모양이 된다.
 */
export function reportUsage(onUsage: UsageReporter | undefined, model: string, data: unknown): void {
  if (!onUsage || !data || typeof data !== "object") return;
  const record = data as Record<string, unknown>;
  const usage = (record.usage ?? record.usageMetadata) as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return;

  const pick = (...names: string[]) => {
    for (const name of names) {
      const value = usage[name];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return undefined;
  };

  const inputTokens = pick("input_tokens", "prompt_tokens", "promptTokenCount");
  const outputTokens = pick("output_tokens", "completion_tokens", "candidatesTokenCount");
  if (inputTokens === undefined && outputTokens === undefined) return;

  onUsage({ model, inputTokens: inputTokens ?? 0, outputTokens: outputTokens ?? 0 });
}
