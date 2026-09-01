import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  FalRunResult,
  FalRunner,
  ImagePromptProvider,
  PlanProvider,
  CopyProvider,
  ReviewRequest,
  ReviewProviderInput,
  ScenePromptRequest,
} from "@fixup/sns-core";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.6-sol";
const FAL_BASE_URL = "https://fal.run";
const FAL_TIMEOUT_MS = 120_000;
const IMAGE_FETCH_TIMEOUT_MS = 30_000;

export class SnsProviderConfigurationError extends Error {
  readonly status = 503;
  constructor(readonly missing: string[], scope: "planning" | "generation") {
    const label = scope === "planning" ? "카드뉴스 기획·원고" : "카드뉴스 이미지 생성·검수";
    super(`${label}에 필요한 환경변수가 없습니다: ${missing.join(", ")}. 서버 설정을 확인해 주세요.`);
    this.name = "SnsProviderConfigurationError";
  }
}

export function requireSnsProviderKeys(
  scope: "planning" | "generation",
  environment: Record<string, string | undefined> = process.env,
) {
  const required = scope === "planning"
    ? ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
    : ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "FAL_KEY"];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new SnsProviderConfigurationError(missing, scope);
}

type JsonSchema = Record<string, unknown>;
type StructuredSpec = { name: string; description: string; schema: JsonSchema };

const PLAN_SPEC: StructuredSpec = {
  name: "submit_card_plan",
  description: "Submit the complete card-news plan.",
  schema: {
    type: "object",
    properties: {
      total: { type: "integer" },
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" }, role: { type: "string", enum: ["cover", "body"] },
            intent: { type: "string" }, visualBrief: { type: "string" },
          },
          required: ["index", "role", "intent", "visualBrief"],
          additionalProperties: false,
        },
      },
    },
    required: ["total", "cards"],
    additionalProperties: false,
  },
};

const COPY_SPEC: StructuredSpec = {
  name: "submit_card_copy",
  description: "Submit the confirmed copy for every planned card.",
  schema: {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" }, headline: { type: "string" }, body: { type: "string" },
            accent: { type: "string" }, footnote: { type: "string" },
          },
          required: ["index", "headline"],
          additionalProperties: false,
        },
      },
    },
    required: ["cards"],
    additionalProperties: false,
  },
};

const REVIEW_SPEC: StructuredSpec = {
  name: "submit_card_review",
  description: "Submit the visual review result for one generated card.",
  schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["pass", "fail"] },
      summary: { type: "string" },
      issues: { type: "array", items: { type: "string" } },
    },
    required: ["decision", "summary", "issues"],
    additionalProperties: false,
  },
};

async function imageBlock(url: string): Promise<Anthropic.ImageBlockParam> {
  const response = await fetch(url, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`검수 이미지를 읽지 못했습니다: HTTP ${response.status}`);
  const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!(["image/jpeg", "image/png", "image/gif", "image/webp"] as string[]).includes(mediaType)) {
    throw new Error(`검수할 수 없는 이미지 형식입니다: ${mediaType}`);
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

class AnthropicStructuredProvider implements PlanProvider, CopyProvider {
  constructor(private readonly client: Anthropic, private readonly model: string, private readonly spec: StructuredSpec) {}
  async generate(prompt: string): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
      tools: [{ name: this.spec.name, description: this.spec.description, input_schema: this.spec.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: this.spec.name, disable_parallel_tool_use: true },
    });
    const call = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === this.spec.name);
    if (!call) throw new Error(`Claude가 ${this.spec.name} 결과를 돌려주지 않았습니다.`);
    return call.input;
  }
}

class OpenAIStructuredProvider implements PlanProvider, CopyProvider {
  constructor(private readonly client: OpenAI, private readonly model: string, private readonly spec: StructuredSpec) {}
  async generate(prompt: string): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [{ role: "developer", content: "Return only the requested structured result." }, { role: "user", content: prompt }],
      tools: [{ type: "function", name: this.spec.name, description: this.spec.description, parameters: this.spec.schema, strict: false }],
      tool_choice: { type: "function", name: this.spec.name },
    });
    const call = response.output.find((item) => item.type === "function_call" && item.name === this.spec.name);
    if (!call || call.type !== "function_call") throw new Error(`OpenAI가 ${this.spec.name} 결과를 돌려주지 않았습니다.`);
    return JSON.parse(call.arguments) as unknown;
  }
}

class AnthropicSceneProvider implements ImagePromptProvider {
  constructor(private readonly client: Anthropic, private readonly model: string) {}
  async generate(request: ScenePromptRequest): Promise<unknown> {
    const images = await Promise.all(request.imageUrls.map(imageBlock));
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1800,
      messages: [{ role: "user", content: [{ type: "text", text: request.prompt }, ...images] }],
    });
    return response.content.filter((block): block is Anthropic.TextBlock => block.type === "text").map((block) => block.text).join("\n");
  }
}

class OpenAISceneProvider implements ImagePromptProvider {
  constructor(private readonly client: OpenAI, private readonly model: string) {}
  async generate(request: ScenePromptRequest): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [{ role: "user", content: [
        { type: "input_text", text: request.prompt },
        ...request.imageUrls.map((imageUrl) => ({ type: "input_image" as const, image_url: imageUrl, detail: "original" as const })),
      ] }],
    });
    if (!response.output_text) throw new Error("OpenAI가 이미지 프롬프트를 돌려주지 않았습니다.");
    return response.output_text;
  }
}

class FallbackSceneProvider implements ImagePromptProvider {
  constructor(private readonly primary: ImagePromptProvider, private readonly backup: ImagePromptProvider) {}
  async generate(request: ScenePromptRequest): Promise<unknown> {
    try { return await this.primary.generate(request); } catch { return this.backup.generate(request); }
  }
}

class AnthropicReviewProvider implements ReviewRequest {
  constructor(private readonly client: Anthropic, private readonly model: string) {}
  async review(input: ReviewProviderInput): Promise<unknown> {
    const images = await Promise.all([input.imageUrl, ...input.preservedImageUrls].map(imageBlock));
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1800,
      messages: [{ role: "user", content: [{ type: "text", text: input.prompt }, ...images] }],
      tools: [{ name: REVIEW_SPEC.name, description: REVIEW_SPEC.description, input_schema: REVIEW_SPEC.schema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: "tool", name: REVIEW_SPEC.name, disable_parallel_tool_use: true },
    });
    const call = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === REVIEW_SPEC.name);
    if (!call) throw new Error("Claude가 검수 결과를 돌려주지 않았습니다.");
    return call.input;
  }
}

class OpenAIReviewProvider implements ReviewRequest {
  constructor(private readonly client: OpenAI, private readonly model: string) {}
  async review(input: ReviewProviderInput): Promise<unknown> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [{ role: "user", content: [
        { type: "input_text", text: input.prompt },
        ...[input.imageUrl, ...input.preservedImageUrls].map((imageUrl) => ({ type: "input_image" as const, image_url: imageUrl, detail: "original" as const })),
      ] }],
      tools: [{ type: "function", name: REVIEW_SPEC.name, description: REVIEW_SPEC.description, parameters: REVIEW_SPEC.schema, strict: false }],
      tool_choice: { type: "function", name: REVIEW_SPEC.name },
    });
    const call = response.output.find((item) => item.type === "function_call" && item.name === REVIEW_SPEC.name);
    if (!call || call.type !== "function_call") throw new Error("OpenAI가 검수 결과를 돌려주지 않았습니다.");
    return JSON.parse(call.arguments) as unknown;
  }
}

export type FalFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class FalHttpRunner implements FalRunner {
  constructor(private readonly apiKey: string, private readonly fetcher: FalFetch = fetch) {}
  async run(endpoint: string, input: Record<string, unknown>, cardIndex: number): Promise<FalRunResult> {
    if (input.num_images !== 1) throw new Error("fal num_images는 반드시 1이어야 합니다.");
    let response: Response;
    try {
      response = await this.fetcher(`${FAL_BASE_URL}/${endpoint}`, {
        method: "POST",
        headers: { Authorization: `Key ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(FAL_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error(`${cardIndex}번 카드가 2분 안에 응답하지 않았습니다. 중복 과금을 피하려고 자동 재시도하지 않습니다.`);
      }
      throw error;
    }
    const text = await response.text();
    let data: { request_id?: string; images?: Array<{ url?: string }>; detail?: string; message?: string } = {};
    try { data = JSON.parse(text) as typeof data; } catch { /* 아래에서 읽을 수 있는 오류로 바꾼다. */ }
    if (!response.ok) {
      const requestId = response.headers.get("x-fal-request-id") ?? response.headers.get("x-request-id");
      const reason = response.status === 401 || response.status === 403
        ? "FAL_KEY가 올바른지 확인해 주세요."
        : response.status === 429
          ? "fal 요청이 몰렸습니다. 잠시 후 사람이 다시 만들기를 눌러 주세요."
          : data.detail ?? data.message ?? `fal HTTP ${response.status}`;
      throw new Error(`${cardIndex}번 카드 생성 실패: ${reason}${requestId ? ` (request_id: ${requestId})` : ""}`);
    }
    const images = (data.images ?? []).flatMap((image) => image.url ? [{ url: image.url }] : []);
    if (!images.length) throw new Error(`${cardIndex}번 카드 생성 실패: fal 응답에 이미지가 없습니다.`);
    return {
      requestId: data.request_id ?? response.headers.get("x-fal-request-id") ?? response.headers.get("x-request-id") ?? undefined,
      images,
    };
  }
}

export interface SnsProviders {
  planningPrimary: PlanProvider;
  planningBackup: PlanProvider;
  copyPrimary: CopyProvider;
  copyBackup: CopyProvider;
  sceneProvider: ImagePromptProvider;
  reviewPrimary: ReviewRequest;
  reviewBackup: ReviewRequest;
  falRunner: FalRunner;
}

function clients(environment: Record<string, string | undefined>) {
  const anthropic = new Anthropic({ apiKey: environment.ANTHROPIC_API_KEY!, maxRetries: 2, timeout: 120_000 });
  const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY!, maxRetries: 2, timeout: 120_000 });
  const anthropicModel = environment.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const openaiTextModel = environment.OPENAI_DRAFT_MODEL?.trim() || DEFAULT_OPENAI_TEXT_MODEL;
  const openaiVisionModel = environment.OPENAI_VISION_MODEL?.trim() || openaiTextModel;
  return { anthropic, openai, anthropicModel, openaiTextModel, openaiVisionModel };
}

export function createSnsPlanningProviders(environment: Record<string, string | undefined> = process.env) {
  requireSnsProviderKeys("planning", environment);
  const { anthropic, openai, anthropicModel, openaiTextModel } = clients(environment);
  return {
    planningPrimary: new AnthropicStructuredProvider(anthropic, anthropicModel, PLAN_SPEC),
    planningBackup: new OpenAIStructuredProvider(openai, openaiTextModel, PLAN_SPEC),
    copyPrimary: new AnthropicStructuredProvider(anthropic, anthropicModel, COPY_SPEC),
    copyBackup: new OpenAIStructuredProvider(openai, openaiTextModel, COPY_SPEC),
  };
}

export function createSnsGenerationProviders(environment: Record<string, string | undefined> = process.env) {
  requireSnsProviderKeys("generation", environment);
  const { anthropic, openai, anthropicModel, openaiVisionModel } = clients(environment);
  return {
    sceneProvider: new FallbackSceneProvider(
      new AnthropicSceneProvider(anthropic, anthropicModel),
      new OpenAISceneProvider(openai, openaiVisionModel),
    ),
    reviewPrimary: new AnthropicReviewProvider(anthropic, anthropicModel),
    reviewBackup: new OpenAIReviewProvider(openai, openaiVisionModel),
    falRunner: new FalHttpRunner(environment.FAL_KEY!),
  };
}

export function createSnsProviders(environment: Record<string, string | undefined> = process.env): SnsProviders {
  const planning = createSnsPlanningProviders(environment);
  const generation = createSnsGenerationProviders(environment);
  return {
    ...planning,
    ...generation,
  };
}
