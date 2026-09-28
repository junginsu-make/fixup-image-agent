import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicStructuredProvider, type StructuredSpec } from "../llm/structured";

/**
 * **CS 도우미가 부르는 모델.**
 *
 * ── 왜 고르게 두지 않나 ────────────────────────────────────
 *
 * 「쉽게」 모드는 사용자가 글 모델을 고른다. CS 답변은 다르다 — **품질이
 * 갈리면 안 된다.** 같은 물음에 사람마다 다른 답이 가면 그것이 곧 문의가
 * 된다.
 *
 * `claude-sonnet-5` 는 **이미 이 저장소의 기본 글 모델**이고 단가표에도
 * 있다($2/$10 per M). 한 물음에 약 5원이다.
 *
 * 바꿔야 하면 `CS_MODEL` 로 바꾼다 — 배포 없이 되돌릴 수 있어야 한다.
 */

export const CS_MODEL_FALLBACK = "claude-sonnet-5";

export class CsConfigurationError extends Error {
  constructor(missing: string) {
    super(`${missing} 이(가) 없어 도우미를 쓸 수 없습니다.`);
    this.name = "CsConfigurationError";
  }
}

/** 값을 재는 것은 바깥의 `withLlmMeter` 가 한다. 여기서는 부르기만 한다. */
export function createCsProvider(spec: StructuredSpec) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new CsConfigurationError("ANTHROPIC_API_KEY");

  const model = process.env.CS_MODEL?.trim() || CS_MODEL_FALLBACK;
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 60_000 });
  return new AnthropicStructuredProvider(client, model, spec);
}
