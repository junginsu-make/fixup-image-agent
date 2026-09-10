import { recordFrom } from "../llm/meter";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { TYPE_INTERACTIONS } from "@fixup/poster-core";
import {
  AnthropicStructuredProvider,
  OpenAIStructuredProvider,
  type StructuredSpec,
} from "../llm/structured";
import { createFalQueueClient } from "../fal/queue";
import { createFalUploader } from "../fal/upload";

/**
 * 포스터 제공자.
 *
 * 카드뉴스 도메인 코드를 참조하지 않는다. 공용 구조화 어댑터와 fal 모듈만 쓴다.
 *
 * **키가 없으면 그 기능만 막고 어떤 키가 없는지 알린다.** 500 으로 끝내면
 * 사용자가 무엇을 고쳐야 할지 모른다.
 */

const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";

export class PosterProviderConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super(`다음 환경변수가 없어 포스터를 만들 수 없습니다: ${missing.join(", ")}`);
    this.name = "PosterProviderConfigurationError";
  }
}

function requireKeys(names: string[], environment: Record<string, string | undefined>) {
  const missing = names.filter((name) => !environment[name]?.trim());
  if (missing.length) throw new PosterProviderConfigurationError(missing);
}

const SLOT_PROPERTIES = {
  kind: { type: "string" },
  headline: { type: "string" },
  subline: { type: "string" },
  sideTexts: { type: "array", items: { type: "string" } },
  scene: { type: "string" },
  subject: { type: "string" },
  action: { type: "string" },
  typeInteraction: { type: ["string", "null"], enum: [...TYPE_INTERACTIONS, null] },
  dominantColor: { type: "string" },
  accentColor: { type: "string" },
  forbidden: { type: "string" },
};

const PLAN_SPEC: StructuredSpec = {
  name: "poster_plan",
  description: "포스터 기획 슬롯을 채운다. 모르는 칸은 빈 문자열로 둔다.",
  schema: {
    type: "object",
    properties: { slots: { type: "object", properties: SLOT_PROPERTIES } },
    required: ["slots"],
  },
};

const GRAMMAR_SPEC: StructuredSpec = {
  name: "poster_grammar",
  description: "레퍼런스 포스터가 어떻게 보이는지만 읽는다.",
  schema: {
    type: "object",
    properties: {
      typeInteraction: { type: ["string", "null"], enum: [...TYPE_INTERACTIONS, null] },
      dominantColor: { type: "string" },
      accentColor: { type: "string" },
      note: { type: "string" },
    },
    required: ["typeInteraction", "dominantColor"],
  },
};

const REVIEW_SPEC: StructuredSpec = {
  name: "poster_review",
  description: "완성된 포스터를 원고와 대조한다. 양방향으로 본다.",
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
          subline: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
          sideTexts: { type: "string", enum: ["exact", "missing", "changed", "not_applicable"] },
        },
        required: ["headline", "subline", "sideTexts"],
      },
      extraCopy: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["none", "present", "uncertain"] },
          texts: { type: "array", items: { type: "string" } },
        },
        required: ["status", "texts"],
      },
    },
    required: ["decision", "summary", "issues", "textFidelity", "extraCopy"],
  },
};

function clients(environment: Record<string, string | undefined>) {
  return {
    anthropic: new Anthropic({ apiKey: environment.ANTHROPIC_API_KEY!, maxRetries: 2, timeout: 120_000 }),
    openai: new OpenAI({ apiKey: environment.OPENAI_API_KEY!, maxRetries: 2, timeout: 120_000 }),
    anthropicModel: environment.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    openaiModel: environment.OPENAI_VISION_MODEL?.trim()
      || environment.OPENAI_DRAFT_MODEL?.trim()
      || DEFAULT_OPENAI_MODEL,
  };
}

/** 이미지를 함께 보여주는 비전 호출. 코드가 대신 묘사하지 않는다. */
async function imageBlocks(urls: string[]) {
  return urls.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } }));
}

export function createPosterPlanningProviders(environment: Record<string, string | undefined> = process.env) {
  requireKeys(["ANTHROPIC_API_KEY"], environment);
  const { anthropic, openai, anthropicModel, openaiModel } = clients(environment);
  const backup = environment.OPENAI_API_KEY?.trim()
    ? { plan: (prompt: string) => new OpenAIStructuredProvider(openai, openaiModel, PLAN_SPEC).generate(prompt) }
    : undefined;
  return {
    primary: { plan: (prompt: string) => new AnthropicStructuredProvider(anthropic, anthropicModel, PLAN_SPEC).generate(prompt) },
    backup,
  };
}

/**
 * 사람을 읽는 눈.
 *
 * 문법 읽기와 **따로 둔다.** 문법은 「어떻게 보이나」(색·타이포)를 읽고 내용을
 * 일부러 안 읽는다 — 그 안에 사람을 끼워 넣으면 둘 다 흐려진다. 도구를 나누면
 * 모델이 한 번에 하나만 본다.
 */
const PEOPLE_SPEC: StructuredSpec = {
  name: "photo_people",
  description: "사진에 있는 사람을 왼쪽부터 한 명씩 적는다.",
  schema: {
    type: "object",
    properties: {
      people: { type: "array", items: { type: "string" } },
    },
    required: ["people"],
  },
};

export function createPosterPeopleReader(environment: Record<string, string | undefined> = process.env) {
  requireKeys(["ANTHROPIC_API_KEY"], environment);
  const { anthropic, anthropicModel } = clients(environment);
  return {
    async read(input: { prompt: string; imageUrls: string[] }) {
      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: [...(await imageBlocks(input.imageUrls)), { type: "text", text: input.prompt }] }],
        tools: [{ name: PEOPLE_SPEC.name, description: PEOPLE_SPEC.description, input_schema: PEOPLE_SPEC.schema as never }],
        tool_choice: { type: "tool", name: PEOPLE_SPEC.name, disable_parallel_tool_use: true },
      });
      recordFrom(anthropicModel, response);
      const call = response.content.find((block) => block.type === "tool_use" && block.name === PEOPLE_SPEC.name);
      if (!call || call.type !== "tool_use") throw new Error("사람을 읽지 못했습니다.");
      return call.input;
    },
  };
}

export function createPosterGrammarReader(environment: Record<string, string | undefined> = process.env) {
  requireKeys(["ANTHROPIC_API_KEY"], environment);
  const { anthropic, anthropicModel } = clients(environment);
  return {
    async read(input: { prompt: string; imageUrls: string[] }) {
      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: [...(await imageBlocks(input.imageUrls)), { type: "text", text: input.prompt }] }],
        tools: [{ name: GRAMMAR_SPEC.name, description: GRAMMAR_SPEC.description, input_schema: GRAMMAR_SPEC.schema as never }],
        tool_choice: { type: "tool", name: GRAMMAR_SPEC.name, disable_parallel_tool_use: true },
      });
      recordFrom(anthropicModel, response);
      const call = response.content.find((block) => block.type === "tool_use" && block.name === GRAMMAR_SPEC.name);
      if (!call || call.type !== "tool_use") throw new Error("문법을 읽지 못했습니다.");
      return call.input;
    },
  };
}

export function createPosterReviewProviders(environment: Record<string, string | undefined> = process.env) {
  requireKeys(["ANTHROPIC_API_KEY"], environment);
  const { anthropic, anthropicModel } = clients(environment);
  return {
    primary: {
      async review(input: { prompt: string; imageUrl: string; preservedImageUrls: string[] }) {
        const response = await anthropic.messages.create({
          model: anthropicModel,
          max_tokens: 2048,
          messages: [{
            role: "user",
            content: [
              ...(await imageBlocks([input.imageUrl, ...input.preservedImageUrls])),
              { type: "text", text: input.prompt },
            ],
          }],
          tools: [{ name: REVIEW_SPEC.name, description: REVIEW_SPEC.description, input_schema: REVIEW_SPEC.schema as never }],
          tool_choice: { type: "tool", name: REVIEW_SPEC.name, disable_parallel_tool_use: true },
        });
        recordFrom(anthropicModel, response);
        const call = response.content.find((block) => block.type === "tool_use" && block.name === REVIEW_SPEC.name);
        if (!call || call.type !== "tool_use") throw new Error("검수 결과를 받지 못했습니다.");
        return call.input;
      },
    },
  };
}

export function createPosterFalClients(environment: Record<string, string | undefined> = process.env) {
  requireKeys(["FAL_KEY"], environment);
  return {
    queue: createFalQueueClient(environment.FAL_KEY!),
    uploader: createFalUploader(environment.FAL_KEY!),
  };
}
