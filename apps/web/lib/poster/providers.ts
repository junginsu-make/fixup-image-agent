import { recordFrom } from "../llm/meter";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { TYPE_INTERACTIONS } from "@fixup/poster-core";
import { textModelVendor } from "@fixup/shared";
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
  description: "포스터 기획 칸을 채우고, 근거 없이 채운 칸을 밝힌다.",
  schema: {
    type: "object",
    properties: {
      slots: { type: "object", properties: SLOT_PROPERTIES },
      /*
       * **여기 없으면 프롬프트로 아무리 시켜도 안 온다.**
       *
       * 구조화 응답은 이 틀에 없는 칸을 버린다. 프롬프트에만 「invented 에
       * 적으세요」를 써 뒀더니 실제 호출에서 **여섯 번 모두 빈 목록**이 왔다
       * (2026-09-17 실측). 모델이 안 따른 것이 아니라 틀이 막고 있었다.
       */
      invented: {
        type: "array",
        items: { type: "string", enum: Object.keys(SLOT_PROPERTIES) },
      },
    },
    required: ["slots", "invented"],
  },
};

const GRAMMAR_SPEC: StructuredSpec = {
  name: "poster_grammar",
  description: "레퍼런스 포스터가 어떻게 보이는지만 읽는다.",
  schema: {
    type: "object",
    properties: {
      // 글자를 넣을지는 붙인 그림이 정한다. 응답 틀에 없으면 프롬프트로 시켜도 안 온다.
      hasText: { type: "boolean" },
      typeInteraction: { type: ["string", "null"], enum: [...TYPE_INTERACTIONS, null] },
      dominantColor: { type: "string" },
      accentColor: { type: "string" },
      note: { type: "string" },
    },
    required: ["hasText", "typeInteraction", "dominantColor"],
  },
};

/**
 * 붙인 그림을 **한 번에** 읽는 틀 (설계 §5-1).
 *
 * 문법 읽기와 사람 읽기를 합친 것이고, **`staging` 한 칸이 새로 생겼다.**
 * 그 칸이 1단계의 전부다 — 없으면 기획이 레퍼런스의 연출을 볼 방법이 없다.
 *
 * **틀에 없는 칸은 조용히 버려진다.** 프롬프트로 시켜도 안 온다. 이 저장소가
 * 두 번 겪었다(`invented` 가 여섯 번 다 빈 목록, `hasText` 가 안 옴).
 */
const ATTACHMENT_READ_SPEC: StructuredSpec = {
  name: "attachment_read",
  description: "붙인 그림에 무엇이 있는지. 사람·연출·글자·색을 한 번에 읽는다.",
  schema: {
    type: "object",
    properties: {
      people: { type: "array", items: { type: "string" } },
      // 이 칸이 1단계가 더하는 것이다. 없으면 연출이 통째로 사라진다.
      staging: { type: "string" },
      hasText: { type: "boolean" },
      typeInteraction: { type: ["string", "null"], enum: [...TYPE_INTERACTIONS, null] },
      dominantColor: { type: "string" },
      accentColor: { type: "string" },
      note: { type: "string" },
    },
    required: ["people", "staging", "hasText"],
  },
};

/**
 * 그림을 보고 틀대로 답하게 하는 눈.
 *
 * **셋이 같은 열다섯 줄을 쓰고 있었다.** 새 읽기를 더하면서 네 번째 사본이
 * 생길 자리라 여기서 합친다 — 고칠 곳이 하나여야 한다.
 */
function imageToolReader(
  spec: StructuredSpec,
  whenMissing: string,
  environment: Record<string, string | undefined>,
) {
  requireKeys(["ANTHROPIC_API_KEY"], environment);
  const { anthropic, anthropicModel } = clients(environment);
  return {
    async read(input: { prompt: string; imageUrls: string[] }) {
      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: 2048,
        messages: [{ role: "user", content: [...(await imageBlocks(input.imageUrls)), { type: "text", text: input.prompt }] }],
        tools: [{ name: spec.name, description: spec.description, input_schema: spec.schema as never }],
        tool_choice: { type: "tool", name: spec.name, disable_parallel_tool_use: true },
      });
      recordFrom(anthropicModel, response);
      const call = response.content.find((block) => block.type === "tool_use" && block.name === spec.name);
      if (!call || call.type !== "tool_use") throw new Error(whenMissing);
      return call.input;
    },
  };
}

/** 붙인 그림을 한 번에 읽는다 — 역할을 안 본다(설계 §5-1). */
export function createPosterAttachmentReader(environment: Record<string, string | undefined> = process.env) {
  return imageToolReader(ATTACHMENT_READ_SPEC, "붙인 그림을 읽지 못했습니다.", environment);
}

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

/**
 * 기획을 돌릴 제공자.
 *
 * ── 고른 글 모델을 실제로 쓴다 ────────────────────────────────
 *
 * `textModel` 을 주면 그 모델로 부른다(Easy 모드의 드롭다운, 설계 §5-4).
 * **안 주면 지금까지대로** 환경변수·기본값으로 간다 — 다른 화면 넷이 이 함수를
 * 부르고 있고, 그 화면들은 글 모델을 고르지 않는다.
 *
 * 업체를 `textModelVendor` 가 가른다. **안 가르면 고른 모델이 안 불린다** —
 * 2026-09-18 에 실제로 그랬다. Easy 의 드롭다운이 값을 받아 되돌려주기만 하고,
 * 기획은 환경변수가 정한 모델로 갔다. **고르는 척만 하는 화면**이었다.
 *
 * ── 예비는 그대로 둔다 ───────────────────────────────────────
 *
 * 주 모델이 실패하면 예비가 받는다. 고른 모델이 OpenAI 면 예비도 OpenAI 라
 * 같은 업체가 두 번 실패할 수 있는데, 그래도 둔다 — 예비를 반대 업체로
 * 뒤집으면 「내가 고른 것과 다른 모델로 만들어졌다」가 조용히 일어난다.
 */
export function createPosterPlanningProviders(
  environment: Record<string, string | undefined> = process.env,
  textModel?: string,
) {
  const vendor = textModel ? textModelVendor(textModel) : "anthropic";
  // 고른 것이 OpenAI 면 그 열쇠가 있어야 한다. 없으면 무엇이 없는지 알린다.
  requireKeys(vendor === "openai" ? ["OPENAI_API_KEY"] : ["ANTHROPIC_API_KEY"], environment);

  const { anthropic, openai, anthropicModel, openaiModel } = clients(environment);
  const backup = environment.OPENAI_API_KEY?.trim()
    ? { plan: (prompt: string) => new OpenAIStructuredProvider(openai, openaiModel, PLAN_SPEC).generate(prompt) }
    : undefined;

  const primary = vendor === "openai"
    ? { plan: (prompt: string) => new OpenAIStructuredProvider(openai, textModel!, PLAN_SPEC).generate(prompt) }
    : {
      plan: (prompt: string) => new AnthropicStructuredProvider(
        anthropic,
        // 고른 것이 있으면 그것으로. 없으면 지금까지대로.
        textModel ?? anthropicModel,
        PLAN_SPEC,
      ).generate(prompt),
    };

  return { primary, backup };
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
  return imageToolReader(PEOPLE_SPEC, "사람을 읽지 못했습니다.", environment);
}

export function createPosterGrammarReader(environment: Record<string, string | undefined> = process.env) {
  return imageToolReader(GRAMMAR_SPEC, "문법을 읽지 못했습니다.", environment);
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
