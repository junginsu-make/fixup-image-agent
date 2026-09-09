import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { PdpLlm, PdpLlmRequest, PdpProviders } from "@fixup/pdp-core";
import { createPdpImageGenerator } from "./fal";
import { unwrapStringified } from "../llm/structured";

/**
 * 상세페이지의 글 모델. **Claude 가 먼저, 실패하면 OpenAI.**
 *
 * 포스터·카드뉴스가 쓰는 방식과 같다(`lib/poster/providers.ts`). 상세페이지만
 * Gemini 를 직접 부르고 있었고, 그 호출이 `pdp-core` 안에 들어 있어 코어가
 * `process.env` 까지 읽었다. 이제 바깥세상은 여기서만 만난다.
 *
 * **키가 없으면 그 기능만 막고 어떤 키가 없는지 알린다.** 500 으로 끝내면
 * 사용자가 무엇을 고쳐야 할지 모른다.
 */

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_MAX_TOKENS = 8192;

export class PdpProviderConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super(`다음 환경변수가 없어 상세페이지를 만들 수 없습니다: ${missing.join(", ")}`);
    this.name = "PdpProviderConfigurationError";
  }
}

type Env = Record<string, string | undefined>;

function requireKeys(names: string[], environment: Env) {
  const missing = names.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new PdpProviderConfigurationError(missing);
}

/** base64 원문을 `data:` 주소로. OpenAI 는 이 모양으로만 그림을 받는다. */
function dataUrl(image: { base64: string; mimeType: string }) {
  return `data:${image.mimeType};base64,${image.base64}`;
}

async function viaAnthropic(
  client: Anthropic,
  model: string,
  request: PdpLlmRequest,
): Promise<unknown> {
  const response = await client.messages.create({
    model,
    max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          // 그림을 먼저 싣는다. 프롬프트가 「첫 번째 그림」이라고 부를 때
          // 가리키는 것이 실제로 첫 번째여야 한다.
          ...(request.images ?? []).map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mimeType as "image/png",
              data: image.base64,
            },
          })),
          { type: "text" as const, text: request.prompt },
        ],
      },
    ],
    tools: [
      {
        name: request.name,
        description: request.description ?? "요청한 모양 그대로 결과를 돌려준다.",
        input_schema: request.schema as Anthropic.Tool.InputSchema,
      },
    ],
    // 도구를 반드시 부르게 한다. 자유 문장으로 답하면 파싱이 깨진다.
    tool_choice: { type: "tool", name: request.name, disable_parallel_tool_use: true },
  });

  const call = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === request.name,
  );
  if (!call) throw new Error(`Claude가 ${request.name} 결과를 돌려주지 않았습니다.`);
  return unwrapStringified(call.input);
}

async function viaOpenAI(
  client: OpenAI,
  model: string,
  request: PdpLlmRequest,
): Promise<unknown> {
  const response = await client.responses.create({
    model,
    max_output_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    input: [
      { role: "developer", content: "Return only the requested structured result." },
      {
        role: "user",
        content: [
          ...(request.images ?? []).map((image) => ({
            type: "input_image" as const,
            image_url: dataUrl(image),
            detail: "high" as const,
          })),
          { type: "input_text" as const, text: request.prompt },
        ],
      },
    ],
    tools: [
      {
        type: "function",
        name: request.name,
        description: request.description ?? "요청한 모양 그대로 결과를 돌려준다.",
        parameters: request.schema as Record<string, unknown>,
        strict: false,
      },
    ],
    tool_choice: { type: "function", name: request.name },
  });

  const call = response.output.find(
    (item) => item.type === "function_call" && item.name === request.name,
  );
  if (!call || call.type !== "function_call") {
    throw new Error(`OpenAI가 ${request.name} 결과를 돌려주지 않았습니다.`);
  }
  return unwrapStringified(JSON.parse(call.arguments) as unknown);
}

/**
 * 상세페이지가 쓸 글 모델.
 *
 * **예비가 없으면 없는 대로 간다.** OpenAI 키가 없다고 상세페이지를 막을 이유는
 * 없다 — 주 모델이 살아 있으면 동작한다.
 */
export function createPdpLlm(environment: Env = process.env): PdpLlm {
  requireKeys(["ANTHROPIC_API_KEY"], environment);

  const anthropic = new Anthropic({
    apiKey: environment.ANTHROPIC_API_KEY!,
    maxRetries: 2,
    timeout: 120_000,
  });
  const anthropicModel = environment.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;

  const openaiKey = environment.OPENAI_API_KEY?.trim();
  const openai = openaiKey
    ? new OpenAI({ apiKey: openaiKey, maxRetries: 2, timeout: 120_000 })
    : null;
  const openaiModel =
    environment.OPENAI_VISION_MODEL?.trim() ||
    environment.OPENAI_DRAFT_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL;

  return {
    async generate(request) {
      try {
        return { text: JSON.stringify(await viaAnthropic(anthropic, anthropicModel, request)) };
      } catch (error) {
        if (!openai) throw error;
        console.warn(`[pdp] Claude 실패, OpenAI 로 넘어갑니다 (${request.name})`, error);
        return { text: JSON.stringify(await viaOpenAI(openai, openaiModel, request)) };
      }
    },
  };
}

/**
 * 키가 없으면 `null`.
 *
 * 레퍼런스 서술·레퍼런스 고르기처럼 **없어도 본 작업이 도는 자리**에서 쓴다.
 * 거기서 던지면 곁다리 때문에 만들기가 통째로 막힌다.
 */
export function createPdpLlmOrNull(environment: Env = process.env): PdpLlm | null {
  try {
    return createPdpLlm(environment);
  } catch {
    return null;
  }
}

/**
 * 상세페이지가 바깥세상과 만나는 자리 전부를 한 번에 만든다.
 *
 * 글 모델과 그림 통로를 따로 넘기면 어느 라우트에서 하나를 빠뜨린다. 묶어
 * 두면 빠뜨릴 자리가 없다.
 */
export function createPdpProviders(environment: Env = process.env): PdpProviders {
  return {
    llm: createPdpLlm(environment),
    generateImage: createPdpImageGenerator(environment),
  };
}
