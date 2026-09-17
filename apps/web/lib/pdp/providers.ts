import { recordFrom } from "../llm/meter";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { purposeOfCall } from "@fixup/pdp-core";
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
const DEFAULT_PLANNING_MODEL = "claude-fable-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
const DEFAULT_MAX_TOKENS = 8192;
/**
 * **기획은 길게 답한다.**
 *
 * 구성안 한 벌은 섹션마다 제목·부제·불릿을 한국어와 영어로 두 번 적는다.
 * 8192 로는 섹션이 여섯이면 끝까지 못 쓴다 — 2026-09-17 실호출 검증에서
 * 텍스트 기획이 그렇게 잘려 죽었다(`docs/bugs/pdp-validation/w3-live-planning.txt`).
 *
 * 검수·참조 분석은 짧게 답하므로 그대로 둔다. 실제 상한은 모델의 종료 사유로
 * 다시 잰다 — 이 값은 「잘리면 알 수 있게」 한 뒤의 출발점이다.
 */
const PLANNING_MAX_TOKENS = 32768;

/**
 * 모델이 끝까지 못 쓴 답.
 *
 * 조각난 도구 인자는 「값이 없는 정상 응답」과 구별되지 않는다. 그대로 흘리면
 * 「섹션이 0개」 같은 엉뚱한 자리에서 죽고, 원인은 사라진 채 값만 나간다.
 */
export class PdpResponseTruncatedError extends Error {
  readonly code = "AI_RESPONSE_TRUNCATED";
  constructor(readonly model: string, readonly name: string) {
    super(`${model} 이(가) ${name} 답을 끝까지 쓰지 못하고 잘렸습니다. 요청을 줄이거나 상한을 올려 주세요.`);
    this.name = "PdpResponseTruncatedError";
  }
}

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

/**
 * 이 호출에 줄 답의 길이.
 *
 * 부르는 쪽이 정했으면 그것을 쓴다. 안 정했으면 **무슨 일을 하는 호출인지**로
 * 정한다 — 기획은 길고 검수는 짧다.
 */
function maxTokensFor(request: PdpLlmRequest): number {
  if (request.maxTokens) return request.maxTokens;
  return request.purpose === "planning" ? PLANNING_MAX_TOKENS : DEFAULT_MAX_TOKENS;
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
    max_tokens: maxTokensFor(request),
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
  recordFrom(model, response);

  // **답이 잘렸으면 여기서 멈춘다.** 아래로 흘리면 조각난 값이 정상 응답으로
  // 읽히고, 그 다음 검증이 「섹션이 없다」고 말한다 — 원인이 두 겹 뒤로 숨는다.
  if (response.stop_reason === "max_tokens") throw new PdpResponseTruncatedError(model, request.name);

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
    max_output_tokens: maxTokensFor(request),
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
  recordFrom(model, response);

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
  const planningModel = environment.PDP_PLANNING_MODEL?.trim() || DEFAULT_PLANNING_MODEL;
  const executions: NonNullable<PdpLlm["executions"]> = [];

  const openaiKey = environment.OPENAI_API_KEY?.trim();
  const openai = openaiKey
    ? new OpenAI({ apiKey: openaiKey, maxRetries: 2, timeout: 120_000 })
    : null;
  const openaiModel =
    environment.OPENAI_VISION_MODEL?.trim() ||
    environment.OPENAI_DRAFT_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL;

  return {
    executions,
    async generate(request) {
      // 이름→목적 표는 코어에 한 벌만 둔다. 여기서 다시 짐작하면 새 호출이
      // 생긴 날 두 곳이 갈린다.
      const purpose = request.purpose ?? purposeOfCall(request.name);
      const model = purpose === "planning" ? planningModel : anthropicModel;
      try {
        const text = JSON.stringify(await viaAnthropic(anthropic, model, request));
        const execution = { purpose, provider: "anthropic" as const, model };
        executions.push(execution);
        return { text, execution };
      } catch (error) {
        // 잘림은 제공자 장애가 아니다. 예비로 넘기면 같은 길이를 한 번 더
        // 치르고 또 잘린다 — 값만 두 배로 쓰고 원인은 그대로다.
        if (error instanceof PdpResponseTruncatedError) throw error;
        const status = (error as { status?: number })?.status;
        // 잘못된 모델/권한/요청 설정을 정상적인 영구 폴백처럼 숨기지 않는다.
        if (purpose === "planning" && status && [400, 401, 403, 404, 422].includes(status)) throw error;
        if (!openai) throw error;
        const fallbackReason = status ? `provider_${status}` : "provider_unavailable";
        console.warn(`[pdp] 대체 기획/검수 모델 사용 (${request.name}, ${fallbackReason})`);
        const text = JSON.stringify(await viaOpenAI(openai, openaiModel, request));
        const execution = { purpose, provider: "openai" as const, model: openaiModel, fallbackFrom: model, fallbackReason };
        executions.push(execution);
        return { text, execution };
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
    /*
      **그림 통로는 부를 때 만든다.**

      바로 만들면 FAL_KEY 확인이 여기로 올라온다. 그러면 그림을 한 장도 안
      만드는 라우트(분석·기획)까지 fal 키를 요구하고, 전에는 되던 배포가 죽는다.

      키 확인 시점을 옮기지 않는 것이 이 리팩터의 약속이었다 — 전에도 그림을
      실제로 만들 때 확인했다.
    */
    generateImage: (model, input) => createPdpImageGenerator(environment)(model, input),
  };
}
