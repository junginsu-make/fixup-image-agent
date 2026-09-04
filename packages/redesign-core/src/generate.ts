import { randomUUID } from "node:crypto";
import {
  IMAGE_LOOKS,
  imageLookDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
import { canUseCommonKnowledge } from "./knowledge-access.js";
import { isRagConfigured, retrieveKnowledge } from "./rag.js";
import { RedesignError } from "./errors.js";
import { GOOGLE_READING_MODEL } from "./transcribe.js";

/**
 * Ported from `.refs/redesign-maker-10/src/app/api/generate/route.ts`.
 *
 * Only the NextRequest multipart parsing and NextResponse serialization were
 * removed. All AI calls, prompt strings, model IDs, RAG calls, section
 * templates and error humanization are byte-for-byte identical to the source.
 *
 * Original route runtime config (declared on the route, re-declare on adapter):
 *   export const runtime = "nodejs";
 *   export const maxDuration = 300;
 *
 * Status-code intent surfaced via RedesignError (see below) / thrown Error:
 *   - missing apiKey                 -> 400 (RedesignError)
 *   - no files uploaded              -> 400 (RedesignError)
 *   - knowledge access key invalid   -> 403 (RedesignError)
 *   - no usable reference images      -> 400 (RedesignError)
 *   - any other failure (analysis / all-image-failure / unexpected)
 *                                    -> 500; the original outer catch wrapped
 *                                       the message with humanizeProviderError.
 *       => This function throws a plain Error here; the route adapter must do
 *          `{ error: humanizeProviderError(err.message) }` at status 500,
 *          matching the original `catch (error)` block exactly.
 */

const OPENAI_IMAGE_MODEL = "gpt-image-2-2026-04-21";
const GOOGLE_NANO_BANANA_2_MODEL = "gemini-3.1-flash-image-preview";
const ANALYSIS_MODEL = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.5";
const MAX_REFERENCE_IMAGES = 4;

type Provider = "openai" | "google";

type ReferenceImage = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

type Section = {
  section_id: string;
  image_id: string;
  name: string;
  purpose: string;
  source: string;
  prompt: string;
  promptText: string;
};

/**
 * Plain representation of an uploaded file, replacing the browser `File`.
 * `buffer` is the raw file bytes (the route handler reads them from the
 * multipart form before calling this function).
 */
export type GenerateInputFile = {
  name: string;
  type: string;
  buffer: Buffer;
};

export type GenerateSectionsInput = {
  files: GenerateInputFile[];
  request?: string;
  rolloutRequest?: string;
  knowledgeText?: string;
  useKnowledge?: boolean;
  knowledgeAccessKey?: string;
  /** Server-authenticated membership may authorize shared knowledge without a client key. */
  knowledgeAccessAuthorized?: boolean;
  /** "openai" | "google" (anything not "google" becomes "openai") */
  model?: string;
  channel?: string;
  ratio?: string;
  count?: number;
  startSection?: number;
  openaiKey?: string;
  googleKey?: string;
  transcript?: string;
  /**
   * 섹션마다 같은 사람이 나오게 하는 기준 한 장.
   *
   * 캐릭터 만들기에서 만든 것을 그대로 쓴다. **한 장만 보낸다** — 여러 각도를
   * 함께 보내면 모델이 절충해 제3의 인물을 만든다(2026-07-30 실측).
   *
   * `directive` 는 그 인물을 지키라는 문장이다. 이미지만 보내면 모델이
   * 참조 중 하나로만 다루고 얼굴을 바꾼다.
   */
  character?: { name: string; mimeType: string; buffer: Buffer; directive: string };
  /**
   * 그림의 결. 기본은 `auto` — 원본의 결을 따라간다.
   *
   * 리디자인은 남의 페이지를 다시 그리는 일이라 원본이 사진이면 사진이,
   * 그림이면 그림이 나오는 것이 자연스럽다. 명시적으로 골랐을 때만 바꾼다.
   */
  look?: ImageLook | string;
};

/** 아는 결인지 확인한다. 모르는 값은 원본을 따라가는 `auto` 로 되돌린다. */
function normalizeLook(value: ImageLook | string | undefined): ImageLook {
  return (IMAGE_LOOKS as readonly string[]).includes(String(value ?? "")) ? (value as ImageLook) : "auto";
}

/**
 * 등장인물을 참조 목록 맨 앞에 놓는다.
 *
 * **앞이어야 한다.** 생성 함수가 MAX_REFERENCE_IMAGES 장에서 자르므로, 뒤에
 * 두면 원본이 많을 때 인물이 조용히 사라진다. 정체성 기준이 먼저다.
 */
/**
 * 첨부한 이미지가 무엇이고 어떻게 다뤄야 하는지 적는다.
 *
 * **이게 없었다.** 리디자인은 원본 상세페이지를 그대로 첨부하면서 프롬프트에는
 * `원본 참조: 제품컷, 대표 USP` 같은 섹션 템플릿 라벨만 붙였다 — 그 라벨은
 * "이 섹션에서 원본의 어느 대목을 쓰라"는 말이지, **첨부된 그림이 무엇인지**를
 * 알려 주는 말이 아니다. 다섯 도구 중 여기만 비어 있었다.
 * 본보기는 상세페이지의 `buildReferenceRoleDirective`(pdp.reference-policy.ts).
 *
 * 무엇을 지키고 무엇을 새로 만드는가는 **이 파일이 이미 말하고 있는 것과 맞춘다**:
 *   · 「안전 규칙: 원본 제품컷/색감/핵심 정보는 보존한다」
 *   · `designLanguageBlock` — 원본의 색 쓰임새까지 그대로 따라간다
 *   · 「전체 연결 규칙: 브랜드 색·폰트 감각은 유지하되 레이아웃은 다르게」
 * 그래서 「색·서체까지 마음대로 새로 디자인하라」고 쓰면 안 된다. 정면충돌한다.
 * 다시 짜는 것은 **페이지의 구성**이지 제품도 사실도 브랜드의 결도 아니다.
 *
 * 순서는 `referencesWithCharacter` 가 담는 순서와 같아야 한다 — 등장인물이
 * 맨 앞이다. 여기서 번호를 다르게 매기면 조용히 어긋난다.
 */
export function buildAttachmentRoleDirective(input: {
  /** 원본 상세페이지로 첨부되는 장수(잘린 뒤의 실제 장수). */
  originalCount: number;
  /** 등장인물 기준컷이 맨 앞에 붙었는가. */
  hasCharacter: boolean;
}): string {
  if (input.originalCount <= 0 && !input.hasCharacter) return "";

  const lines = [
    // 첨부가 있어도 모델은 "이런 종류의 페이지"를 기억에서 꺼내 그리는 쪽으로
    // 쏠린다. 그러면 라벨 글자가 비슷한 다른 글자가 되고 색도 근처 색이 된다.
    "Study every attached image closely before drawing. They are the source of truth for what" +
      " they define — reproduce what you actually see in them. Do not approximate them from" +
      " memory, and never substitute a generic stand-in.",
    "",
  ];

  let index = 1;
  if (input.hasCharacter) {
    // 인물을 지키라는 문장 자체는 buildSceneWithCharacterDirective 가 따로 붙인다.
    // 여기서는 몇 번째 그림이 그것인지만 밝힌다 — 같은 말을 두 번 하지 않는다.
    lines.push(`[Image ${index} — PERSON] The character identity anchor for this page.`);
    lines.push("");
    index += 1;
  }

  if (input.originalCount > 0) {
    const range =
      input.originalCount === 1 ? `Image ${index}` : `Images ${index}-${index + input.originalCount - 1}`;
    lines.push(
      `[${range} — ORIGINAL DETAIL PAGE]`,
      "This is the page being redesigned. Keep what it is about:",
      "  · the product itself — silhouette, colour, finish, material",
      "  · every logo, label and package text, spelled exactly as shown",
      "  · the factual claims, numbers and copy meaning",
      "  · the brand's design language — its colours and how each one is used, its type character",
      "What you redesign is the page, not the product: section layout and composition, information" +
        " hierarchy, how the copy is grouped and paced, which element leads the eye.",
      "Never redesign, restyle or substitute the product itself.",
    );
  }

  return lines.join("\n").trimEnd();
}

export function referencesWithCharacter(
  originals: ReferenceImage[],
  character: ReferenceImage | undefined,
): ReferenceImage[] {
  return (character ? [character, ...originals] : originals).slice(0, MAX_REFERENCE_IMAGES);
}

export async function generateSections(input: GenerateSectionsInput) {
  const files = input.files || [];
  const requestText = String(input.request || "");
  const rolloutRequest = String(input.rolloutRequest || "");
  const knowledgeText = String(input.knowledgeText || "").slice(0, 60000);
  const useKnowledge = input.useKnowledge === true || String(input.useKnowledge || "") === "true";
  const knowledgeAccessKey = String(input.knowledgeAccessKey || "");
  const provider: Provider = String(input.model || "openai") === "google" ? "google" : "openai";
  const channel = String(input.channel || "스마트스토어");
  const ratio = String(input.ratio || "9:16");
  const count = clamp(Number(input.count ?? 1), 1, 10);
  const startSection = clamp(Number(input.startSection ?? 1), 1, 10);
  const openaiKey = String(input.openaiKey || "");
  const googleKey = String(input.googleKey || "");
  const apiKey = provider === "google" ? googleKey : openaiKey;
  const transcript = String(input.transcript || "").slice(0, 60000);

  console.info(`[generate] request provider=${provider} count=${count} startSection=${startSection} files=${files.length} channel=${channel}`);

  if (!apiKey) {
    throw new RedesignError(
      provider === "google" ? "Google Nano Banana 2 API 키가 필요합니다." : "OpenAI Image 2.0 API 키가 필요합니다.",
      400
    );
  }

  if (files.length === 0) {
    throw new RedesignError("기존 상세페이지 이미지 또는 PDF를 업로드해주세요.", 400);
  }

  if (useKnowledge && !input.knowledgeAccessAuthorized && !canUseCommonKnowledge(knowledgeAccessKey)) {
    throw new RedesignError("공통 사전 지식 사용 키가 올바르지 않습니다.", 403);
  }

  const jobId = randomUUID();
  const references = await prepareReferenceImages(files);
  console.info(`[generate] references prepared job=${jobId} references=${references.length}`);
  if (references.length === 0) {
    throw new RedesignError("이미지 생성에 사용할 참조 이미지가 없습니다. PDF는 브라우저에서 PNG로 변환한 뒤 전송됩니다.", 400);
  }

  const modelInfo = modelMeta(provider);
  const retrievedKnowledgeText = useKnowledge
    ? await buildKnowledgeContext({
        requestText,
        rolloutRequest,
        channel,
        fallbackText: knowledgeText
      })
    : "";
  console.info(`[generate] knowledge ready job=${jobId} useKnowledge=${useKnowledge} chars=${retrievedKnowledgeText.length}`);
  const payload = { request: requestText, rolloutRequest, knowledgeText: retrievedKnowledgeText, options: { channel, ratio, count } };
  console.info(`[generate] analysis start job=${jobId}`);
  const analysis = await analyzeSource({ provider, apiKey, references, payload, modelInfo, transcript });
  console.info(`[generate] analysis done job=${jobId}`);
  // 분석에는 인물을 넣지 않는다. 분석은 원본 상세페이지를 읽어 제품을 파악하는
  // 일이라, 인물이 섞이면 제품 분석이 오염된다. 생성에만 넣는다.
  const character = input.character;
  const drawReferences = referencesWithCharacter(
    references,
    character ? { name: character.name, mimeType: character.mimeType, buffer: character.buffer } : undefined,
  );
  // 실제로 fal 에 가는 첨부 구성 그대로 역할을 적는다. 여기서 다시 세면
  // 프롬프트의 번호와 첨부 순서가 갈라진다.
  const attachmentDirective = buildAttachmentRoleDirective({
    originalCount: drawReferences.length - (character ? 1 : 0),
    hasCharacter: Boolean(character),
  });
  const sections = buildSections(count, startSection, payload, analysis, modelInfo, character?.directive, {
    attachmentDirective,
    look: normalizeLook(input.look),
  });
  const projectTitle = inferProjectTitle(analysis, channel);

  const generatedSections = [];
  const failedSections = [];
  for (const [index, section] of sections.entries()) {
    try {
      console.info(`[generate] ${provider} ${section.section_id} start (${index + 1}/${sections.length})`);
      const image = provider === "google"
        ? await generateGoogleImage({ apiKey, prompt: section.promptText, references: drawReferences })
        : await generateOpenAIImage({ apiKey, prompt: section.promptText, references: drawReferences });

      generatedSections.push({
        ...section,
        imageUrl: `data:${image.mimeType};base64,${image.buffer.toString("base64")}`,
        mimeType: image.mimeType
      });
      console.info(`[generate] ${provider} ${section.section_id} done bytes=${image.buffer.length} mime=${image.mimeType}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "이미지 생성 실패";
      console.error(`[generate] ${provider} ${section.section_id} failed: ${message}`);
      failedSections.push({
        ...section,
        error: message
      });
      if (generatedSections.length === 0) {
        throw new Error(`${section.name} 생성 실패: ${humanizeProviderError(message)}`);
      }
      break;
    }
  }

  console.info(`[generate] complete provider=${provider} generated=${generatedSections.length} failed=${failedSections.length}`);

  return {
    project: {
      id: jobId,
      title: projectTitle,
      channel,
      model: provider,
      modelLabel: modelInfo.label,
      modelId: modelInfo.id,
      count: generatedSections.length,
      ratio,
      status: failedSections.length > 0 ? "부분완료" : "완료",
      files: files.map((file) => file.name),
      request: requestText,
      createdAt: new Date().toISOString(),
      analysis,
      sections: generatedSections,
      failedSections,
      warning: failedSections.length > 0
        ? `${generatedSections.length}장은 생성됐고 ${failedSections.length}장 이후는 실패했습니다. OpenAI Image 2.0 요청 제한이면 잠시 후 섹션별 재생성을 실행하세요.`
        : ""
    }
  };
}

async function buildKnowledgeContext({
  requestText,
  rolloutRequest,
  channel,
  fallbackText
}: {
  requestText: string;
  rolloutRequest: string;
  channel: string;
  fallbackText: string;
}) {
  const fallback = fallbackText.slice(0, 60000);
  if (!isRagConfigured()) return fallback;

  try {
    const query = [
      "상세페이지 리디자인 CRO 지식 검색",
      `판매 채널: ${channel}`,
      `추가 요청사항: ${requestText || "전환율 중심 리디자인"}`,
      rolloutRequest ? `히어로 검토 후 요청: ${rolloutRequest}` : ""
    ].filter(Boolean).join("\n");
    const chunks = await retrieveKnowledge(query, 8);
    if (chunks.length === 0) return fallback;

    return chunks
      .map((chunk, index) => [
        `# RAG 검색 지식 ${index + 1}: ${chunk.sourceName} / chunk ${chunk.chunkIndex + 1}`,
        `similarity: ${chunk.similarity.toFixed(3)}`,
        chunk.content
      ].join("\n"))
      .join("\n\n")
      .slice(0, 30000);
  } catch (error) {
    console.warn("[rag] retrieve failed, using fallback knowledge", error);
    return fallback;
  }
}

export function buildAnalyzePrompt(
  payload: { request: string; rolloutRequest: string; knowledgeText: string; options: { channel: string; ratio: string; count: number } },
  modelInfo: { label: string; id: string },
  transcript?: string
): string {
  const trimmed = String(transcript || "").slice(0, 60_000);
  const transcriptBlock = trimmed
    ? [
        "[원본 상세페이지 카피 인벤토리 — 전사]: 아래는 업로드된 기존 상세페이지에서 실제로 받아쓴 전체 텍스트다. 이 사실 범위 안에서만 재구성하라.",
        "전사에 없는 수치/인증/효능/후기를 새로 만들지 마라. 전사에서 반복 강조된 셀링포인트는 누락하지 마라.",
        "<상세페이지_전사>",
        trimmed,
        "</상세페이지_전사>",
      ].join("\n")
    : "원본 전사: 없음(이미지만으로 추정).";
  return [
    "너는 전환율 중심 CRO 카피라이터 + 상세페이지 UX 디자이너 + 커머스 리서처다.",
    "업로드된 기존 상세페이지와 전사를 근거로 카테고리, USP, 타겟, 전환 저해 요소, 유지할 장점, 리디자인 전략을 한국어 JSON으로 요약하라.",
    "근거 없는 수치/효과/리뷰/인증을 만들지 말고, 위험 표현은 안전하게 완화하라.",
    `판매 채널: ${payload.options.channel}`,
    `추가 요청사항: ${payload.request || "전환율 중심으로 리디자인"}`,
    payload.rolloutRequest ? `히어로 검토 후 나머지 섹션에 반영할 요청: ${payload.rolloutRequest}` : "히어로 검토 후 요청: 없음",
    payload.knowledgeText ? `사용자 사전 지식:\n${payload.knowledgeText.slice(0, 30000)}` : "사용자 사전 지식: 없음",
    transcriptBlock,
    `이미지 생성 모델: ${modelInfo.label} (${modelInfo.id})`,
    "JSON 키: product_inferred, diagnostic_summary, strategy, page_blueprint, design_language, compliance_notes, verified_facts.",
    "verified_facts: 전사에서 확인된 정확 사실(인증번호·성분/함량·시험수치·핵심 클레임)을 원문 표기 그대로, 중복 제거해 문자열 배열로. 없으면 빈 배열. 최대 60개.",
    // 색을 나열만 하면 이미지 생성 모델이 그 색을 글자색으로만 쓰고 면으로는 쓰지 않는다.
    // 상세페이지 A/B 실측(2026-07-30)으로 확인했다 — 쓰임새를 문장으로 적어야 따라온다.
    // 원본 페이지 이미지를 첨부해도 마찬가지다. 첨부만으로는 전달되지 않는다.
    "design_language: 원본의 디자인 언어를 **쓰임새까지** 적는다. 색을 나열만 하면 생성 모델이 그 색을 글자색으로만 쓰고 배경/띠로는 쓰지 않는다.",
    "  · colour_usage: 어떤 색이 배경·띠·카드 같은 **면을 채우는지**, 어떤 색이 **글자**인지, 어떤 색이 **강조**인지 각각 밝힌다. (예: \"짙은 남색을 섹션 배경 전체에 깔고, 본문은 흰색, 강조는 노란색\")",
    "  · typography: 서체 굵기·자폭·성격, 제목과 본문의 크기 비.",
    "  · layout: 정보를 담는 그릇(표·카드·띠), 여백 리듬, CTA 위치.",
  ].join("\n");
}

async function analyzeSource({
  provider,
  apiKey,
  references,
  payload,
  modelInfo,
  transcript
}: {
  provider: Provider;
  apiKey: string;
  references: ReferenceImage[];
  payload: { request: string; rolloutRequest: string; knowledgeText: string; options: { channel: string; ratio: string; count: number } };
  modelInfo: ReturnType<typeof modelMeta>;
  transcript?: string;
}) {
  const prompt = buildAnalyzePrompt(payload, modelInfo, transcript);

  try {
    if (provider === "google") {
      return await analyzeWithGoogle({ apiKey, prompt, references });
    }
    return await analyzeWithOpenAI({ apiKey, prompt, references });
  } catch (error) {
    return {
      product_inferred: { category: "업로드 자료 기반 추정", confidence: 0.4 },
      diagnostic_summary: `AI 분석 호출 실패: ${error instanceof Error ? error.message : "unknown"}`,
      strategy: "원본 자료의 제품컷/USP/근거를 보존하고, 6~8장 섹션 구조로 전환 설계를 적용합니다.",
      page_blueprint: [],
      compliance_notes: "근거 없는 수치, 리뷰, 인증, 효과 표현은 생성하지 않습니다.",
      verified_facts: []
    };
  }
}

async function analyzeWithOpenAI({ apiKey, prompt, references }: { apiKey: string; prompt: string; references: ReferenceImage[] }) {
  const content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }> = [{ type: "input_text", text: prompt }];
  for (const reference of references.slice(0, MAX_REFERENCE_IMAGES)) {
    content.push({
      type: "input_image",
      image_url: `data:${reference.mimeType};base64,${reference.buffer.toString("base64")}`
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content }]
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "OpenAI 분석 요청 실패", response));
  const text = data.output_text || extractOpenAIText(data);
  return parseMaybeJson(text);
}

async function analyzeWithGoogle({ apiKey, prompt, references }: { apiKey: string; prompt: string; references: ReferenceImage[] }) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  for (const reference of references.slice(0, MAX_REFERENCE_IMAGES)) {
    parts.push({
      inlineData: {
        mimeType: reference.mimeType,
        data: reference.buffer.toString("base64")
      }
    });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_READING_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ contents: [{ parts }] })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "Google 분석 요청 실패", response));
  const text = data?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text || "";
  return parseMaybeJson(text);
}

async function generateOpenAIImage({ apiKey, prompt, references }: { apiKey: string; prompt: string; references: ReferenceImage[] }) {
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", "1152x2048");
  form.append("quality", "low");
  form.append("output_format", "png");

  for (const reference of references.slice(0, MAX_REFERENCE_IMAGES)) {
    form.append("image[]", new Blob([new Uint8Array(reference.buffer)], { type: reference.mimeType }), reference.name);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "OpenAI Image 2.0 생성 실패", response));
  const imageBase64 = data?.data?.[0]?.b64_json;
  if (!imageBase64) throw new Error("OpenAI 응답에 이미지 데이터가 없습니다.");
  return { mimeType: "image/png", buffer: Buffer.from(imageBase64, "base64") };
}

async function generateGoogleImage({ apiKey, prompt, references }: { apiKey: string; prompt: string; references: ReferenceImage[] }) {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  for (const reference of references.slice(0, MAX_REFERENCE_IMAGES)) {
    parts.push({
      inlineData: {
        mimeType: reference.mimeType,
        data: reference.buffer.toString("base64")
      }
    });
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_NANO_BANANA_2_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ contents: [{ parts }] })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "Google Nano Banana 2 생성 실패", response));
  const imagePart = data?.candidates?.[0]?.content?.parts?.find((part: { inlineData?: { data?: string } }) => part.inlineData);
  if (!imagePart?.inlineData?.data) throw new Error("Google 응답에 이미지 데이터가 없습니다.");
  return {
    mimeType: imagePart.inlineData.mimeType || "image/png",
    buffer: Buffer.from(imagePart.inlineData.data, "base64")
  };
}

export function factsForSections(analysis: unknown): string[] {
  const facts = (analysis as { verified_facts?: unknown })?.verified_facts;
  return Array.isArray(facts) ? facts.filter((f): f is string => typeof f === "string").slice(0, 60) : [];
}

/**
 * 원본의 디자인 언어를 **지시로** 싣는다.
 *
 * 색을 나열만 하면 생성 모델이 그 색을 글자색으로만 쓰고 면으로는 쓰지 않는다.
 * 상세페이지 쪽 A/B 실측(2026-07-30, 조건당 2장)에서 확인했다 — 원본 이미지를
 * 첨부해도 "이 색을 면으로 쓸지 글자로 쓸지"는 전달되지 않았다. 문장이 있어야 따라온다.
 *
 * 분석에 design_language 가 없으면(구버전 응답 등) 빈 문자열을 돌려 아무 말도 하지 않는다.
 */
function designLanguageBlock(analysis: unknown): string {
  if (!analysis || typeof analysis !== "object") return "";
  const language = (analysis as Record<string, unknown>).design_language;
  if (!language) return "";

  const text = typeof language === "string" ? language : JSON.stringify(language);
  if (!text.trim() || text === "{}" || text === "[]") return "";

  return [
    "원본의 디자인 언어(색을 어디에 쓰는지까지 그대로 따라간다):",
    text.slice(0, 1200),
    "색은 나열이 아니라 쓰임새로 재현한다 — 면을 채우는 색은 면으로, 글자색은 글자로, 강조색은 강조로 쓴다.",
  ].join("\n");
}

export function buildSections(
  count: number,
  startSection: number,
  payload: { request: string; rolloutRequest: string; knowledgeText: string; options: { channel: string; ratio: string; count: number } },
  analysis: unknown,
  modelInfo: ReturnType<typeof modelMeta>,
  /** 등장인물을 지키라는 문장. **모든 섹션에 붙는다** — 한 장만 빠져도 그 장에서 다른 사람이 나온다. */
  characterDirective?: string,
  options?: {
    /** 첨부 이미지의 역할. `buildAttachmentRoleDirective` 가 실제 첨부 구성으로 만든다. */
    attachmentDirective?: string;
    /** 그림의 결. 기본 `auto` 는 아무 말도 보태지 않는다. */
    look?: ImageLook;
  }
): Section[] {
  // 「추가 요청사항」이 곧 사용자가 직접 친 지시다. 리디자인에는 이미 이 칸이
  // 있으므로 새 입력을 하나 더 만들지 않는다 — 두 칸이 서로 다투게 된다.
  const userInstruction = payload.request.trim();
  const lookDirective = imageLookDirective(options?.look ?? "auto");

  return sectionTemplates(count, startSection).map((template) => {
    const facts = factsForSections(analysis);
    const isFactSection = template.id === "S4" || template.id === "S5";
    const factsBlock = isFactSection && facts.length
      ? `\n검증된 원본 사실(정확 표기 유지, 이 안에서만 인증/수치 사용):\n${facts.map((f) => `- ${f}`).join("\n")}\n핵심 인증/수치는 읽기 쉬운 정보 패널로 크게 배치한다(이 섹션에 한해 '작은 글씨 회피' 규칙보다 우선).`
      : "";
    const promptText = [
      // 사용자가 직접 친 말은 맨 앞과 맨 뒤에 두 번 넣는다. 2026-09-04 실측에서
      // 프롬프트 뒤에 긴 문단을 붙였더니 앞쪽 구도 지시가 밀려 무시됐다 —
      // 긴 프롬프트에서 중간 문장은 힘을 잃는다.
      userInstructionHead(userInstruction),
      "너는 커머스 상세페이지 리디자인 이미지 생성 엔진이다.",
      `이미지 생성 모델: ${modelInfo.label} (${modelInfo.id})`,
      "세로형 9:16 상세페이지 섹션 이미지 1장을 생성한다.",
      // 첨부가 무엇인지 먼저 밝히고 섹션 이야기로 넘어간다. 뒤에 두면
      // 「원본 참조: 제품컷」 같은 섹션 라벨과 섞여 무엇을 가리키는지 흐려진다.
      options?.attachmentDirective ?? "",
      `섹션: ${template.name}`,
      `목적: ${template.purpose}`,
      `원본 참조: ${template.source}`,
      `권장 레이아웃: ${template.layout}`,
      `판매 채널: ${payload.options.channel}`,
      `추가 요청사항: ${payload.request || "전환율 중심으로 리디자인"}`,
      payload.rolloutRequest ? `히어로 1장 검토 후 사용자가 요청한 반영사항: ${payload.rolloutRequest}` : "히어로 검토 후 반영사항: 없음",
      payload.knowledgeText ? `참고 사전 지식: ${payload.knowledgeText.slice(0, 18000)}` : "참고 사전 지식: 없음",
      `분석 요약: ${JSON.stringify(analysis).slice(0, 2400)}`,
      // 분석의 design_language 를 따로 뽑아 싣는다. 요약 JSON 안에 묻히면 2400자
      // 자르기에 잘려 나가고, 묻혀 있으면 지시로 읽히지 않는다.
      designLanguageBlock(analysis),
      "브랜드명 금지 규칙: '한이룸', '한이룸의', '한이룸 스킨', 'HANEERUM', 'Haneerum', 'HR'은 서비스명 또는 도구명일 뿐이며 제품 브랜드가 아니다. 이 단어들을 이미지 안의 제품명, 브랜드명, 로고, 라벨, 헤드라인, 후기, FAQ, CTA, 패키지 텍스트로 절대 사용하지 않는다.",
      "브랜드 사용 규칙: 제품 브랜드명과 제품명은 업로드된 원본 상세페이지 또는 제품 패키지에서 확인되는 이름만 사용한다. 원본에서 확인되지 않는 새 브랜드명, 새 제품명, 새 로고를 만들지 않는다.",
      "전체 연결 규칙: 8장을 이어 붙였을 때 하나의 상세페이지처럼 보여야 한다. 동일한 브랜드 색, 폰트 감각, 제품 사진 톤은 유지하되 각 섹션의 레이아웃은 반드시 다르게 구성한다. 모든 섹션이 큰 상단 헤드라인+중앙 제품컷으로 반복되면 안 된다.",
      "섹션별 변화 규칙: 제품 위치, 정보 카드 모양, 아이콘 밀도, 배경 분할, CTA 위치, 타이포 크기 리듬을 섹션마다 다르게 한다. 같은 헤드라인 문구를 반복하지 말고, 섹션 목적에 맞는 새로운 제목을 쓴다.",
      "안전 규칙: 원본 제품컷/색감/핵심 정보는 보존한다. 근거 없는 수치, 리뷰, 인증, 효과를 만들지 않는다. 한 장에 메시지 하나만 담는다. 한국어 문구는 크게, 불릿은 3개 이하로 배치한다. 복잡한 배경과 작은 글씨를 피한다. 규제 리스크가 있으면 안전한 표현으로 완화한다.",
      factsBlock,
      lookDirective,
      characterDirective ?? "",
      // 제품·인물이 레퍼런스를 이기는 서열은 그대로 두고, 사용자 지시를 그 위에 얹는다.
      priorityLine({ hasUserInstruction: Boolean(userInstruction), hasPreserved: true }),
      userInstructionTail(userInstruction)
    ]
      .filter(Boolean)
      .join("\n");

    return {
      section_id: template.id,
      image_id: `IMG_${template.id}`,
      name: template.name,
      purpose: template.purpose,
      source: template.source,
      prompt: promptText.replaceAll("\n", "<br>"),
      promptText
    };
  });
}

async function prepareReferenceImages(files: GenerateInputFile[]): Promise<ReferenceImage[]> {
  const references: ReferenceImage[] = [];
  for (const file of files) {
    const buffer = Buffer.from(file.buffer);
    const safeName = sanitizeFileName(file.name || "upload");
    const mimeType = file.type || guessMimeType(safeName);

    if (mimeType.startsWith("image/")) {
      references.push({ name: safeName, mimeType, buffer });
    }
  }
  return references.slice(0, MAX_REFERENCE_IMAGES);
}

function sectionTemplates(count: number, startSection = 1) {
  const templates = [
    ["S1 히어로", "3초 안에 제품, 타겟, 핵심 약속, CTA를 전달합니다.", "제품컷, 대표 USP", "제품컷을 크게 쓰는 히어로. 상단은 짧은 약속, 하단은 CTA/핵심 배지. 상세페이지의 첫 장답게 가장 강한 비주얼."],
    ["S2 문제 공감", "고객이 자기 상황이라고 느끼는 체크리스트를 배치합니다.", "사용 전 고민 문구", "히어로와 다르게 제품컷은 작게 보조로 두고, 체크리스트/상황 카드 중심. 대화형 질문 구조."],
    ["S3 베네핏 3개", "기능 나열을 체감 언어로 바꿔 기억 구조를 만듭니다.", "기능 설명, 사용 장점", "3개 베네핏을 세로 스텝 또는 아이콘 타일로 구성. 제품은 측면 또는 코너에 배치해 반복을 피함."],
    ["S4 USP 차별점", "경쟁 제품 대비 선택 이유를 한 문장으로 압축합니다.", "소재, 구성, 가격", "비교표/선택 이유 카드 중심. 제품컷은 우측 하단 또는 표 옆에 작게 배치."],
    ["S5 근거/신뢰", "결과, 조건, 해석의 3단 구조로 신뢰를 설계합니다.", "인증, 수치, 테스트", "문서/라벨/성분표를 읽기 쉬운 정보 패널로 구성. 배경은 밝게, 데이터 카드 중심."],
    ["S6 사용법", "선택지를 2~3개로 줄여 구매 후 사용 장벽을 낮춥니다.", "루틴, 구성품", "타임라인/루틴 플로우 중심. 제품은 사용 장면과 함께 작게 배치하고 큰 헤드라인 반복 금지."],
    ["S7 후기 카드", "실제 리뷰가 있을 때 사용감 문장 후기 카드로 구성합니다.", "리뷰, 평점", "후기 카드 6개 내외의 콜라주형 레이아웃. 제품컷은 배경 요소로만 약하게 사용."],
    ["S8 FAQ/오퍼", "마지막 구매 저항을 해소하고 CTA로 마무리합니다.", "배송, AS, 혜택", "FAQ 아코디언처럼 보이는 질문 카드와 하단 CTA. 마지막 행동 유도에 집중."],
    ["S9 비교/보증", "선택 불안을 줄이는 비교표와 보증 구조를 제안합니다.", "보증, 비교 근거", "비교 매트릭스와 보증 배지 중심. 제품 이미지는 작은 확인 요소."],
    ["S10 최종 CTA", "혜택과 구매 이유를 다시 압축해 마지막 행동을 유도합니다.", "오퍼, 사은품, 한정 조건", "최종 CTA 전용. 기존 섹션 요약 3개와 구매 버튼을 하단에 강하게 배치."]
  ];

  return templates
    .map(([name, purpose, source, layout], index) => ({ id: `S${index + 1}`, name, purpose, source, layout }))
    .slice(startSection - 1, startSection - 1 + count);
}

function inferProjectTitle(analysis: unknown, channel: string) {
  const product = typeof analysis === "object" && analysis && "product_inferred" in analysis
    ? (analysis as { product_inferred?: Record<string, unknown> }).product_inferred || {}
    : {};
  const brand = pickString(product, ["brand_name", "brand", "manufacturer", "maker"]);
  const productName = pickString(product, ["product_name", "name", "product", "title"]);
  const category = pickString(product, ["category", "product_category"]);

  if (brand && productName) {
    return productName.includes(brand) ? `${productName} 리디자인` : `${brand} ${productName} 리디자인`;
  }
  if (productName) return `${productName} 리디자인`;
  if (category) return `${category} 상세페이지 리디자인`;
  return `${channel} 상세페이지 리디자인`;
}

function pickString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseMaybeJson(text: string) {
  const raw = String(text || "").trim();
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) return { summary: raw };
  try {
    return JSON.parse(jsonText);
  } catch {
    return { summary: raw };
  }
}

function extractOpenAIText(data: { output?: Array<{ content?: Array<{ text?: string }> }> }) {
  return data.output?.flatMap((item) => item.content || []).map((content) => content.text || "").filter(Boolean).join("\n") || "";
}

function modelMeta(provider: Provider) {
  if (provider === "google") {
    return { provider: "google" as const, label: "Google Nano Banana 2", id: GOOGLE_NANO_BANANA_2_MODEL };
  }
  return { provider: "openai" as const, label: "OpenAI Image 2.0", id: OPENAI_IMAGE_MODEL };
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text || response.statusText } };
  }
}

function withRequestId(message: string, response: Response) {
  const requestId = response.headers.get("x-request-id");
  return requestId ? `${message} (request_id: ${requestId})` : message;
}

export function humanizeProviderError(message: string) {
  if (message.includes("Incorrect API key provided")) {
    return [
      "OpenAI API 키가 올바르지 않습니다.",
      "API 키 설정에서 기존 키를 삭제한 뒤 OpenAI Platform에서 발급한 최신 키를 다시 입력해주세요.",
      message.match(/request_id: [^)]+/)?.[0] || ""
    ].filter(Boolean).join(" ");
  }
  if (message.includes("invalid_api_key")) {
    return [
      "API 키가 올바르지 않습니다.",
      "선택한 이미지 생성 모델에 맞는 API 키를 다시 입력해주세요.",
      message.match(/request_id: [^)]+/)?.[0] || ""
    ].filter(Boolean).join(" ");
  }
  if (message.includes("must be verified") && message.includes("gpt-image-2-2026-04-21")) {
    return [
      "OpenAI Image 2.0 사용 권한이 아직 없습니다.",
      "이 모델은 OpenAI 조직 인증이 필요합니다.",
      "OpenAI Platform > Settings > Organization > General에서 Verify Organization을 완료한 뒤 15분 정도 기다려주세요.",
      message.match(/request_id: [^)]+/)?.[0] || ""
    ].filter(Boolean).join(" ");
  }
  if (message.includes("Invalid image file or mode")) {
    return [
      "업로드 이미지 형식이 OpenAI Image 2.0 편집 입력과 맞지 않습니다.",
      "긴 상세페이지 캡처나 JPG 색상 모드 문제일 수 있어, 앱에서 PNG 변환/분할 후 다시 전송하도록 수정했습니다.",
      "새로고침 후 다시 생성해주세요.",
      message.match(/request_id: [^)]+/)?.[0] || ""
    ].filter(Boolean).join(" ");
  }
  return message;
}

function sanitizeFileName(name: string) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "upload";
}

function guessMimeType(name: string) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
