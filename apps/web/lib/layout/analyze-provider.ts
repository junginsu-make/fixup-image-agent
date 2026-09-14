import { recordedLlmCall } from "../llm/recorded-call";
import { recordFrom } from "../llm/meter";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { LAYOUT_ANALYSIS_PROMPT, LAYOUT_ANALYSIS_SCHEMA } from "@fixup/layout-core";
import { unwrapStringified } from "../llm/structured";

/**
 * B — 레퍼런스 한 장을 비전 모델에 보내고 칸 목록을 받는다.
 *
 * 카드뉴스 검수와 같은 모양(그림 + 도구 호출)이지만 그쪽 제공자를 그대로
 * 쓸 수 없다. 검수는 검수 스키마에 묶여 있고, 이 기능은 자기 스키마를
 * 가진다. 옆 파일을 고치는 대신 여기서 자기 것을 만든다.
 *
 * 실패해도 A 는 그대로 된다. B 는 A 의 입구 하나일 뿐이다.
 */

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-5.6-sol";
const IMAGE_FETCH_TIMEOUT_MS = 30_000;
const TOOL_NAME = "submit_card_layout";
const TOOL_DESCRIPTION = "Submit the areas found in this card image.";

export class LayoutAnalysisConfigurationError extends Error {
  readonly status = 503;
  constructor(readonly missing: string[]) {
    super(`레퍼런스 칸 읽기에는 ${missing.join(" 또는 ")} 중 하나가 필요합니다. 서버 설정을 확인해 주세요.`);
    this.name = "LayoutAnalysisConfigurationError";
  }
}

export interface LayoutAnalysisProvider {
  analyze(imageUrl: string): Promise<unknown>;
}

async function imageBlock(url: string): Promise<Anthropic.ImageBlockParam> {
  // 지금 부르는 곳은 서버가 만든 data: URL 만 넘긴다. 나중에 「주소로 레퍼런스
  // 넣기」가 붙으면 이 fetch 가 그대로 우리 서버 안쪽을 두드리는 문이 된다.
  if (!url.startsWith("data:image/")) throw new Error("레퍼런스 그림 주소가 올바르지 않습니다.");
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`레퍼런스 이미지를 내려받지 못했습니다: HTTP ${response.status}`);
  const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mediaType)) {
    throw new Error(`읽을 수 없는 이미지 형식입니다: ${mediaType}`);
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: Buffer.from(await response.arrayBuffer()).toString("base64"),
    },
  };
}

class AnthropicLayoutAnalyst implements LayoutAnalysisProvider {
  constructor(private readonly client: Anthropic, private readonly model: string) {}

  async analyze(imageUrl: string): Promise<unknown> {
    const response = await (async () => { const body = {
      model: this.model,
      max_tokens: 1800,
      messages: [{
        role: "user",
        content: [{ type: "text", text: LAYOUT_ANALYSIS_PROMPT }, await imageBlock(imageUrl)],
      }],
      tools: [{
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        input_schema: LAYOUT_ANALYSIS_SCHEMA as unknown as Anthropic.Tool.InputSchema,
      }],
      tool_choice: { type: "tool", name: TOOL_NAME, disable_parallel_tool_use: true },
    } satisfies Parameters<typeof this.client.messages.create>[0]; return recordedLlmCall("anthropic", this.model, body, () => this.client.messages.create(body), 1800); })();
    recordFrom(this.model, response);
    const call = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
    );
    if (!call) throw new Error("Claude가 칸 목록을 돌려주지 않았습니다.");
    // 긴 응답에서 도구 호출 형식이 흐트러져 결과를 JSON 문자열로 넣어 온다.
    // 저장소의 다른 제공자가 모두 이 대책을 지난다.
    return unwrapStringified(call.input);
  }
}

class OpenAILayoutAnalyst implements LayoutAnalysisProvider {
  constructor(private readonly client: OpenAI, private readonly model: string) {}

  async analyze(imageUrl: string): Promise<unknown> {
    const response = await (async () => { const body = { max_output_tokens: 16384,
      model: this.model,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: LAYOUT_ANALYSIS_PROMPT },
          { type: "input_image", image_url: imageUrl, detail: "original" },
        ],
      }],
      tools: [{
        type: "function",
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters: LAYOUT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        strict: false,
      }],
      tool_choice: { type: "function", name: TOOL_NAME },
    } satisfies Parameters<typeof this.client.responses.create>[0]; return recordedLlmCall("openai", this.model, body, () => this.client.responses.create(body), 16384); })();
    recordFrom(this.model, response);
    const call = response.output.find((item) => item.type === "function_call" && item.name === TOOL_NAME);
    if (!call || call.type !== "function_call") throw new Error("OpenAI가 칸 목록을 돌려주지 않았습니다.");
    return unwrapStringified(JSON.parse(call.arguments) as unknown);
  }
}

/**
 * 키가 하나만 있어도 돈다.
 *
 * 전에는 둘 다 없으면 503 이었다. Anthropic 키만 있는 서버에서 주 모델이
 * 멀쩡한데 「환경변수가 없습니다」로 막히는 것은 맞지 않다. 예비가 없으면
 * 예비 없이 간다 — `withIssueFallback` 이 이미 그 경우를 안다.
 */
export function createLayoutAnalysisProviders(
  environment: Record<string, string | undefined> = process.env,
): { primary: LayoutAnalysisProvider; backup?: LayoutAnalysisProvider } {
  const anthropicKey = environment.ANTHROPIC_API_KEY?.trim();
  const openaiKey = environment.OPENAI_API_KEY?.trim();
  if (!anthropicKey && !openaiKey) {
    throw new LayoutAnalysisConfigurationError(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
  }

  const openaiModel = environment.OPENAI_VISION_MODEL?.trim()
    || environment.OPENAI_DRAFT_MODEL?.trim()
    || DEFAULT_OPENAI_VISION_MODEL;
  const openai = openaiKey
    ? new OpenAILayoutAnalyst(new OpenAI({ apiKey: openaiKey, maxRetries: 0, timeout: 120_000 }), openaiModel)
    : undefined;

  if (!anthropicKey) return { primary: openai! };
  const anthropic = new AnthropicLayoutAnalyst(
    new Anthropic({ apiKey: anthropicKey, maxRetries: 0, timeout: 120_000 }),
    environment.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
  );
  return openai ? { primary: anthropic, backup: openai } : { primary: anthropic };
}
