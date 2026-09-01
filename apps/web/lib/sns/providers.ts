import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  ImagePromptProvider,
  PlanProvider,
  CopyProvider,
  ReviewRequest,
  ReviewProviderInput,
  ScenePromptRequest,
} from "@fixup/sns-core";
import {
  AnthropicStructuredProvider,
  OpenAIStructuredProvider,
  type StructuredSpec,
} from "../llm/structured";
import { createFalQueueClient, type FalQueueClient } from "../fal/queue";
import { createFalUploader, type FalUploader } from "../fal/upload";

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.6-sol";
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
      textFidelity: {
        type: "object",
        properties: {
          headline: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
          body: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
          accent: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
          footnote: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
        },
        required: ["headline", "body", "accent", "footnote"],
        additionalProperties: false,
      },
      extraCopy: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["none", "present", "uncertain"] },
          texts: { type: "array", items: { type: "string" } },
        },
        required: ["status", "texts"],
        additionalProperties: false,
      },
    },
    required: ["decision", "summary", "issues", "textFidelity", "extraCopy"],
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

export interface SnsProviders {
  planningPrimary: PlanProvider;
  planningBackup: PlanProvider;
  copyPrimary: CopyProvider;
  copyBackup: CopyProvider;
  sceneProvider: ImagePromptProvider;
  reviewPrimary: ReviewRequest;
  reviewBackup: ReviewRequest;
  falQueue: FalQueueClient;
  falUploader: FalUploader;
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
  const falQueue = createFalQueueClient(environment.FAL_KEY!);
  const falUploader = createFalUploader(environment.FAL_KEY!);
  return {
    sceneProvider: new FallbackSceneProvider(
      new AnthropicSceneProvider(anthropic, anthropicModel),
      new OpenAISceneProvider(openai, openaiVisionModel),
    ),
    reviewPrimary: new AnthropicReviewProvider(anthropic, anthropicModel),
    reviewBackup: new OpenAIReviewProvider(openai, openaiVisionModel),
    falQueue,
    falUploader,
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
