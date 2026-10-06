import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  CHARACTER_BRIEF_SPEC,
  buildCharacterBriefRequest,
  composeBriefDescription,
  parseCharacterBrief,
  type CharacterBriefInput,
} from "@fixup/pdp-core";
import { AnthropicStructuredProvider, type StructuredProvider, type StructuredSpec } from "./llm/structured";

/**
 * 캐릭터 묘사를 **이미지 모델이 오해하지 않는 영어**로 정리한다.
 *
 * ── 왜 Sonnet 인가 ─────────────────────────────────────────
 *
 * 이 저장소의 기본 글 모델이고 단가표에 있다($2/$10 per M). 처음엔 하이쿠로
 * 잡았는데 사용자가 상위 모델로 정했다(2026-10-06). 한 번에 몇 원이다.
 * 바꿔야 하면 `CHARACTER_BRIEF_MODEL`, 끄려면 `CHARACTER_BRIEF=off` —
 * 배포 없이 되돌릴 수 있어야 한다.
 *
 * ── 실패하면 원문 그대로 ────────────────────────────────────
 *
 * 정리는 거드는 일이다. 이것 때문에 그림이 안 나오면 안 된다. 그래서 여기서는
 * **아무것도 던지지 않는다.** 값은 바깥의 `withLlmMeter` 가 잰다.
 */

export const CHARACTER_BRIEF_MODEL_FALLBACK = "claude-sonnet-5";
const TIMEOUT_MS = 20_000;

export interface PreparedBrief {
  /** 정면 프롬프트에 넣을 말. 정리에 실패하면 사용자가 친 말 그대로다. */
  prompt: string;
  /** 저장할 정체성. 정리에 실패하면 사용자가 친 말 그대로다. */
  identity: string;
  refined: boolean;
}

export function createCharacterBriefProvider(
  environment: Record<string, string | undefined> = process.env,
): StructuredProvider | null {
  if (environment.CHARACTER_BRIEF?.trim() === "off") return null;
  const key = environment.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  const model = environment.CHARACTER_BRIEF_MODEL?.trim() || CHARACTER_BRIEF_MODEL_FALLBACK;
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: TIMEOUT_MS });
  return new AnthropicStructuredProvider(client, model, CHARACTER_BRIEF_SPEC as StructuredSpec);
}

export async function prepareCharacterBrief(
  input: CharacterBriefInput,
  provider: StructuredProvider | null = createCharacterBriefProvider(),
): Promise<PreparedBrief> {
  const original: PreparedBrief = { prompt: input.description, identity: input.description, refined: false };
  if (!provider) return original;
  try {
    const brief = parseCharacterBrief(await provider.generate(buildCharacterBriefRequest(input)));
    if (!brief) return original;
    return { prompt: composeBriefDescription(brief), identity: brief.identity, refined: true };
  } catch (error) {
    console.error(`[character] 묘사를 정리하지 못해 원문으로 만듭니다: ${error instanceof Error ? error.message : String(error)}`);
    return original;
  }
}
