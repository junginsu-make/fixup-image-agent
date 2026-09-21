import { randomUUID } from "node:crypto";
import {
  IMAGE_LOOKS,
  attachmentPlacementRule,
  characterAngleDirective,
  designerPersona,
  imageLookDirective,
  priorityLine,
  userInstructionHead,
  userInstructionTail,
  type ImageLook,
} from "@fixup/shared";
import { canUseCommonKnowledge } from "./knowledge-access.js";
import { isRagConfigured, retrieveKnowledge } from "./rag.js";
import { RedesignError } from "./errors.js";
import { reportUsage } from "./usage.js";
import { GROUNDING_RULE } from "@fixup/shared";
import { assertNotTruncated, TRUNCATED_CODE } from "./truncation.js";
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
/**
 * 한 번에 함께 보낼 수 있는 원본 장수.
 *
 * **넘긴 장은 조용히 버려진다.** 긴 상세페이지를 조각으로 나눠 올리는 것이
 * 이 도구의 정상 사용이라, 화면이 이 값을 알고 사용자에게 말해 줘야 한다.
 * 그래서 내보낸다.
 */
export const MAX_REFERENCE_IMAGES = 4;

/**
 * 고른 비율이 **실제로 나오는 크기**를 정한다.
 *
 * 전에는 `size` 가 `"1152x2048"` 로 못 박혀 있었다. 비율은 프롬프트 글자로만
 * 들어가서, 화면에서 무엇을 고르든 결과는 같았다. 지금 화면이 주는 두 선택지가
 * 마침 둘 다 9:16 이라 **결과는 맞았지만 조작부가 거짓말을 하고 있었다.**
 *
 * 비율을 늘릴 때는 여기만 고치면 된다. 모르는 값이면 지금까지의 크기를
 * 그대로 쓴다 — 새 비율을 넣다가 옛 작업이 깨지지 않게.
 */
/**
 * 그림 품질. **이제는 대비책 전용이다(2026-09-11).**
 *
 * 주된 길은 `generateImage` 로 주입받는다 — 앱이 fal 을 거쳐 gpt-image-2.5 를
 * `max` 품질로 부른다. 이 상수는 **그 주입이 없을 때**(fal 키가 없는 자리)만
 * 쓰이는 옛 길의 값이다.
 *
 * `low` 였다가 `high` 로 올렸다.
 *
 * 이 저장소의 다른 도구는 전부 `high` 이상이다 — 카드뉴스·포스터·캐릭터는
 * `model.quality ?? "high"` 로 보내고, 표준형·정밀형 플러스는 `max` 다.
 * **리디자인만 `low`** 였다. 외부에서 코드를 그대로 옮겨 오면서 딸려 온
 * 설정이고, 누가 골랐다는 흔적이 없다.
 *
 * 상세페이지는 글자가 많다. 저품질은 그 글자가 뭉개지는 자리라 가장 안 맞는
 * 선택이었다.
 *
 * **값과 함께 움직인다.** 품질을 바꾸면 단가도 바뀐다 — `credit-cost.ts` 의
 * `redesign-openai` 와 DB 의 `model_prices` 를 같이 고쳐야 한다. 한쪽만 고치면
 * 전에 그랬듯 **고품질 값을 받고 저품질을 만들어 주거나 그 반대**가 된다.
 * 그 둘이 어긋나지 않게 `redesign-quality.test.ts` 가 잡는다.
 */
const IMAGE_QUALITY = "high";

const DEFAULT_IMAGE_SIZE = "1152x2048";

const SIZE_BY_RATIO: Record<string, string> = {
  "9:16": "1152x2048",
  "1080×1920": "1152x2048",
  "1080x1920": "1152x2048",
};

export function sizeForRatio(ratio: string): string {
  return SIZE_BY_RATIO[String(ratio || "").trim()] ?? DEFAULT_IMAGE_SIZE;
}

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
  /**
   * 등장인물 그림들. **한 사람의 여러 각도**다.
   *
   * 예전에는 한 장이었다. 그래서 정면을 만들어 둬도 리디자인은 늘 좌측 45도만
   * 썼다(2026-09-15 사용자 보고) — 여기는 섹션이 만들어지기 전에 캐릭터를 정해서
   * 각도 자동 선택이 빈 문자열로 돌기 때문이다. 이제 사람이 고른다.
   *
   * 지시문(`directive`)은 사람 하나에 하나다. 첫 장의 것을 쓴다.
   */
  characters?: Array<{ name: string; mimeType: string; buffer: Buffer; directive: string }>;
  /**
   * 그림의 결. 기본은 `auto` — 원본의 결을 따라간다.
   *
   * 리디자인은 남의 페이지를 다시 그리는 일이라 원본이 사진이면 사진이,
   * 그림이면 그림이 나오는 것이 자연스럽다. 명시적으로 골랐을 때만 바꾼다.
   */
  look?: ImageLook | string;
  /**
   * 글 모델이 쓴 토큰을 **부르는 쪽에 알린다.**
   *
   * 이 꾸러미는 업체를 `fetch` 로 직접 부른다. 앱의 계량기(`llm/meter.ts`)는
   * SDK 래퍼에 붙어 있어서 여기를 못 잡았고, **리디자인의 글값은 장부에 0원**
   * 이었다.
   *
   * 계량기를 여기서 import 하지 않는 이유는 그것이 앱 쪽 물건이기 때문이다 —
   * 꾸러미가 앱을 거꾸로 참조하면 둘이 엉킨다. 대신 값을 넘기고, 어디에 적을지는
   * 라우트가 정한다.
   */
  onUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void;
  /**
   * **이미 한 기획.** 있으면 다시 안 한다(F-7-7).
   *
   * 화면의 「나머지 섹션 생성」은 자기 자신을 한 장씩 다시 부른다. 그래서
   * 여덟 장 채우기는 **분석도 여덟 번** 돌았다 — 글 모델 값이 여덟 배고,
   * 그만큼 더 기다리고, 무엇보다 **청크마다 다른 계획**이 나왔다.
   *
   * 분석 결과는 이미 응답에 실려 돌아간다(`project.analysis`). 그것을 도로
   * 주면 된다.
   *
   * **쓸 만한 것만 믿는다.** 화면이 가진 사본이 낡았거나 비었으면 무시하고
   * 다시 분석한다 — 그대로 쓰면 F-7-3 이 막은 「빈 분석으로 유료 생성」이
   * 뒷문으로 되살아난다.
   */
  analysis?: unknown;
  /**
   * **페이지가 몇 장짜리인가.** 이 요청이 만드는 장수(`count`)와 다른 수다.
   *
   * 화면이 장마다 따로 부르므로 `count` 는 늘 1이다. 그 수로 「N장을 이어
   * 붙였을 때」를 적으면 모든 요청이 「1장」이 된다(2026-09-21 리뷰 회귀).
   */
  pageTotal?: number;
  /**
   * 그림을 **실제로 만드는 사람.**
   *
   * 주면 이것을 쓰고, 없으면 지금까지처럼 업체를 직접 부른다.
   *
   * 왜 주입받나 — 이 저장소의 다른 코어(`pdp-core`·`poster-core`)가 그렇게
   * 한다. **무엇을 보낼지는 코어가 알되 보내지는 않는다.** 바깥세상(키·업로드·
   * 재시도)은 `apps/web` 이 맡는다. 그래야 코어를 시험할 때 업체를 안 부른다.
   *
   * 리디자인만 예외였다 — 포팅해 온 코드가 `fetch` 를 직접 들고 있었고, 그래서
   * 다른 도구가 쓰는 fal 경로와 모델 목록을 함께 쓸 수 없었다.
   */
  generateImage?: RedesignImageGenerator;
};

/** 프롬프트와 첨부를 받아 그림 한 장을 돌려준다. */
export type RedesignImageGenerator = (input: {
  prompt: string;
  references: Array<{ name: string; mimeType: string; buffer: Buffer }>;
  /** `"1152x2048"` 꼴. 비율에서 나온다. */
  size: string;
}) => Promise<{ buffer: Buffer; mimeType: string }>;

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
  /**
   * 맨 앞에 붙은 등장인물 그림 수. **한 사람의 여러 각도**다.
   *
   * 실제로 붙은 장수여야 한다 — `referencesWithCharacter` 가 원본 자리를 남기려고
   * 잘라낸 뒤의 수다. 여기서 다르게 세면 프롬프트의 번호와 첨부 순서가 갈라진다.
   */
  characterCount: number;
}): string {
  if (input.originalCount <= 0 && input.characterCount <= 0) return "";

  const lines = [
    // 첨부가 있어도 모델은 "이런 종류의 페이지"를 기억에서 꺼내 그리는 쪽으로
    // 쏠린다. 그러면 라벨 글자가 비슷한 다른 글자가 되고 색도 근처 색이 된다.
    "Study every attached image closely before drawing. They are the source of truth for what" +
      " they define — reproduce what you actually see in them. Do not approximate them from" +
      " memory, and never substitute a generic stand-in.",
    "",
  ];

  let index = 1;
  if (input.characterCount > 0) {
    // 인물을 지키라는 문장 자체는 buildSceneWithCharacterDirective 가 따로 붙인다.
    // 여기서는 몇 번째 그림이 그것인지만 밝힌다 — 같은 말을 두 번 하지 않는다.
    for (let count = 0; count < input.characterCount; count += 1) {
      lines.push(`[Image ${index} — PERSON] The character identity anchor for this page.`);
      index += 1;
    }
    /*
     * 여러 장이면 **한 사람의 여러 각도**다. 그 말을 안 하면 모델이 서로 다른
     * 사람 여럿으로 읽고 절충해 제3의 인물을 만든다(2026-07-30 실측). 카드뉴스·
     * 포스터·상세페이지와 같은 문장을 쓴다 — 두 곳이 다른 말을 하면 같은 캐릭터가
     * 도구마다 다르게 나온다.
     */
    if (input.characterCount > 1) lines.push(characterAngleDirective(input.characterCount));
    lines.push("");
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
      // 2026-09-04 사용자 보고: 제품이 「약간 변형되어」 나왔다. 「같은 제품」은
      // 모델에게 「비슷한 제품」으로도 읽힌다. 그 문을 닫는다.
      "Match seams, hardware and surface finish as well — this is not a similar product, " +
        "it is this exact product. Its identity must survive unchanged.",
    );
  }

  // 지킨 것이 구석에 작게 들어가면 지킨 보람이 없다. 자리를 정하게 한다.
  lines.push("", attachmentPlacementRule(true));

  return lines.join("\n").trimEnd();
}

/**
 * 등장인물 각도를 참조 목록 **맨 앞**에 놓되, 원본 자리를 남긴다.
 *
 * 앞이어야 하는 이유는 예전 그대로다 — 생성 함수가 `MAX_REFERENCE_IMAGES` 장에서
 * 자르므로 뒤에 두면 원본이 많을 때 인물이 조용히 사라진다.
 *
 * **새로 생긴 걱정은 반대쪽이다.** 사람이 각도를 여러 장 고를 수 있게 되면서
 * (2026-09-15), 고른 대로 다 넣으면 원본 상세페이지가 밀려난다. 그러면 리디자인이
 * 아니라 기억으로 새로 그리기가 된다. 그래서 **원본이 있으면 최소 한 장은
 * 남긴다** — 각도를 덜 쓰는 편이 대상을 잃는 것보다 낫다.
 */
export function referencesWithCharacter(
  originals: ReferenceImage[],
  characters: ReferenceImage[],
): ReferenceImage[] {
  return [
    ...characters.slice(0, characterSlots(originals.length, characters.length)),
    ...originals,
  ].slice(0, MAX_REFERENCE_IMAGES);
}

/**
 * 인물 각도가 **실제로 몇 장** 붙는가.
 *
 * 프롬프트의 번호가 첨부 순서와 갈라지지 않으려면 자르는 규칙을 **한 곳**에서만
 * 알아야 한다. `referencesWithCharacter` 와 `buildAttachmentRoleDirective` 가
 * 따로 세면, 상한에 걸린 날 「Image 4 — PERSON」이라고 적어 놓고 4번에는 원본이
 * 붙는다.
 */
export function characterSlots(originalCount: number, characterCount: number): number {
  const room = originalCount > 0 ? MAX_REFERENCE_IMAGES - 1 : MAX_REFERENCE_IMAGES;
  return Math.min(characterCount, room);
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
      provider === "google" ? "속도형 API 키가 필요합니다." : "정밀형 API 키가 필요합니다.",
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
  // 이미 한 기획이 있으면 다시 안 한다(F-7-7). 쓸 만한 것만 믿는다.
  const reusedAnalysis = isUsableAnalysis(input.analysis) ? input.analysis : undefined;
  console.info(`[generate] analysis start job=${jobId} reused=${Boolean(reusedAnalysis)}`);
  const analysis = reusedAnalysis
    ?? await analyzeSource({ provider, apiKey, references, payload, modelInfo, transcript, onUsage: input.onUsage });
  console.info(`[generate] analysis done job=${jobId}`);
  // 분석에는 인물을 넣지 않는다. 분석은 원본 상세페이지를 읽어 제품을 파악하는
  // 일이라, 인물이 섞이면 제품 분석이 오염된다. 생성에만 넣는다.
  const characters = input.characters ?? [];
  const character = characters[0];
  const drawReferences = referencesWithCharacter(
    references,
    characters.map((view) => ({ name: view.name, mimeType: view.mimeType, buffer: view.buffer })),
  );
  // 실제로 붙은 인물 장수. 상한 때문에 고른 것보다 적을 수 있다.
  const attachedCharacterCount = characterSlots(references.length, characters.length);
  // 실제로 fal 에 가는 첨부 구성 그대로 역할을 적는다. 여기서 다시 세면
  // 프롬프트의 번호와 첨부 순서가 갈라진다.
  const attachmentDirective = buildAttachmentRoleDirective({
    originalCount: drawReferences.length - attachedCharacterCount,
    characterCount: attachedCharacterCount,
  });
  const sections = buildSections(count, startSection, payload, analysis, modelInfo, character?.directive, {
    attachmentDirective,
    look: normalizeLook(input.look),
    pageTotal: Number(input.pageTotal) || undefined,
  });
  const projectTitle = inferProjectTitle(analysis, channel);

  const generatedSections = [];
  const failedSections = [];
  for (const [index, section] of sections.entries()) {
    try {
      console.info(`[generate] ${provider} ${section.section_id} start (${index + 1}/${sections.length})`);
      const image = input.generateImage
        ? await input.generateImage({
            prompt: section.promptText,
            references: drawReferences,
            size: sizeForRatio(ratio),
          })
        : provider === "google"
          ? await generateGoogleImage({ apiKey, prompt: section.promptText, references: drawReferences })
          : await generateOpenAIImage({ apiKey, prompt: section.promptText, references: drawReferences, size: sizeForRatio(ratio) });

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

      /**
       * **시도조차 못 한 섹션도 적어 둔다.**
       *
       * 전에는 여기서 그냥 `break` 였다. 여덟 장 중 셋째가 실패하면 넷째부터
       * 여덟째는 **시도도 기록도 안 된 채 사라졌다** — 화면은 「2장 만듦,
       * 1장 실패」로 보여 주고, 사용자는 사라진 다섯 장을 다시 만들 방법이
       * 없었다. 만든 만큼만 받으므로 돈 문제는 아니지만 **결과가 조용히
       * 증발한다.**
       *
       * 이어서 시도하지 않는 이유는 그대로다 — 앞이 요청 제한으로 막혔으면
       * 뒤도 막힌다. 다만 **무엇이 남았는지는 남긴다.**
       */
      for (const skipped of sections.slice(index + 1)) {
        failedSections.push({
          ...skipped,
          error: "앞 섹션이 실패해 시도하지 않았습니다. 잠시 후 이 섹션만 다시 만들 수 있습니다.",
        });
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
        ? `${generatedSections.length}장은 생성됐고 ${failedSections.length}장 이후는 실패했습니다. 정밀형 요청 제한이면 잠시 후 섹션별 재생성을 실행하세요.`
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
    // 지어내면 안 되는 것의 목록은 두 도구가 한 벌로 쓴다(F-7-1).
    GROUNDING_RULE,
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

/**
 * **쓸 만한 분석인가.**
 *
 * 기획이 쓰는 칸 중 하나라도 차 있으면 쓸 만하다고 본다. 넷 다 비면 모델이
 * 아무 말도 안 한 것이고, 그 상태로 그리면 자료를 한 번도 안 읽은 페이지가
 * 나온다.
 *
 * **엄하게 잡지 않는다.** 모델이 칸 이름을 조금 다르게 줘도 사람이 보기에
 * 쓸 만한 답이면 통과해야 한다 — 여기서 과하게 막으면 멀쩡한 생성이 죽는다.
 */
function isUsableAnalysis(analysis: unknown): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  const value = analysis as Record<string, unknown>;

  if (value.product_inferred || value.design_language) return true;
  if (typeof value.strategy === "string" && value.strategy.trim()) return true;
  if (typeof value.diagnostic_summary === "string" && value.diagnostic_summary.trim()) return true;
  if (Array.isArray(value.page_blueprint) && value.page_blueprint.length > 0) return true;
  // 모델이 JSON 이 아닌 글로 답한 경우. 내용이 있으면 프롬프트에 실을 값이 된다.
  if (typeof value.summary === "string" && value.summary.trim()) return true;

  return false;
}

async function analyzeSource({
  provider,
  apiKey,
  references,
  payload,
  modelInfo,
  transcript,
  onUsage
}: {
  provider: Provider;
  apiKey: string;
  references: ReferenceImage[];
  payload: { request: string; rolloutRequest: string; knowledgeText: string; options: { channel: string; ratio: string; count: number } };
  modelInfo: ReturnType<typeof modelMeta>;
  transcript?: string;
  onUsage?: GenerateSectionsInput["onUsage"];
}) {
  const prompt = buildAnalyzePrompt(payload, modelInfo, transcript);

  try {
    const analysis = provider === "google"
      ? await analyzeWithGoogle({ apiKey, prompt, references, onUsage })
      : await analyzeWithOpenAI({ apiKey, prompt, references, onUsage });

    /*
      **터지는 실패만 실패가 아니다.**

      분석이 비는 길은 둘인데 catch 는 던지는 쪽만 잡는다. 다른 하나는
      **200 인데 본문이 빈 경우**다 — `parseMaybeJson` 은 절대 안 던지고
      `{ summary: "" }` 를 정상 반환한다. 그대로 흐르면 프롬프트에
      `분석 요약: {"summary":""}` 가 박힌 채 장마다 값이 나간다. 설계 §14.5 가
      쓴 말 그대로의 「**빈 분석**으로 유료 생성」이다.

      지어낼 수 있는 상황이 아니다. 기획 모델은 추론 모델이라 추론 토큰을 다
      쓰면 200 에 빈 `output_text` 를 주고, Google 쪽은 안전차단이면
      `candidates` 가 비어 빈 글자로 떨어진다.

      **던져서 아래 catch 로 합류시킨다.** 사용자가 보는 말도, 상태도, 크레딧도
      터진 실패와 똑같아야 한다.
    */
    if (!isUsableAnalysis(analysis)) {
      throw new Error(`분석 응답이 비었습니다: ${JSON.stringify(analysis).slice(0, 200)}`);
    }
    return analysis;
  } catch (error) {
    /*
      **여기서 멈춘다**(F-7-3).

      전에는 지어낸 결과를 돌려줬다 — `page_blueprint: []` 에 만들어 낸 제품
      추정과 일반론 전략이었다. 그 상태로 생성이 그대로 돌고 **장마다 값이
      나간다.** 사용자는 자기 자료를 한 번도 안 읽은 페이지를 받고 그 값을 낸다.

      더 나빴던 것은 **아무도 그 사실을 몰랐다**는 점이다. 실패는
      `diagnostic_summary` 라는 글에만 남는데 그것을 화면에 띄우는 곳이 한
      군데도 없었다.

      예약은 생성 **앞**에 있다. 여기서 멈추면 크레딧은 0으로 닫히고 사용자는
      아무것도 잃지 않는다.

      **5xx 로 준다.** 4xx 면 화면이 「입력이 잘못됐다」로 읽어, 멀쩡한 자료를
      다시 만들려고 애쓰게 된다.

      **「이 요청에는」을 뺄 수 없다.** 일괄 생성은 한 장씩 여러 번 부르므로,
      다섯째에서 멈췄으면 앞 네 장은 이미 차감됐다. 그냥 「크레딧은 사용되지
      않았습니다」라고 하면 사용자가 읽는 단위(여덟 장 만들기)에서 거짓이 된다.
    */
    const detail = error instanceof Error ? error.message : String(error);
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status
      : undefined;
    console.error(`[generate] 분석 실패로 중단 status=${status ?? "none"}`, error);

    /*
      **고칠 수 있는 실패를 「잠시 후 다시」로 뭉개지 않는다.**

      제공자가 4xx 로 거절한 것은 **다시 시도해도 영원히 안 된다** — 키가
      틀렸거나, 조직 인증이 안 됐거나, 올린 그림 형식이 안 맞는 경우다.
      `humanizeProviderError` 가 그 셋에 대해 무엇을 하면 되는지 적어 두었는데,
      전부 502 로 덮으면 그 안내가 **도달할 수 없는 글**이 된다.

      429(한도)는 뺀다. 그것은 진짜로 잠시 후 다시다.
    */
    if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
      throw new RedesignError(humanizeProviderError(detail), 400);
    }

    /*
      **잘린 것도 「잠시 후 다시」가 아니다**(F-7-1).

      다시 불러도 같은 길이를 쓴다. 할 일은 원본 장수를 줄이거나 상한을 올리는
      것이고, 그 말이 이미 오류에 적혀 있다. 일반 문구로 덮으면 사용자가
      같은 요청을 계속 다시 보낸다.
    */
    if ((error as { code?: unknown })?.code === TRUNCATED_CODE) {
      /*
        `error.message` 는 **이미 사용자에게 보일 말**이다. 모델 이름과
        finishReason 은 `error.detail` 에만 있고 위 `console.error` 로만 나간다
        — 상세페이지가 공급자 문구를 한 겹 번역해 내보내는 것과 같은 계약이다
        (`pdp.service.ts`).
      */
      throw new RedesignError(detail, 422);
    }

    throw new RedesignError(
      "업로드한 자료를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요. 이 요청에는 크레딧이 사용되지 않았습니다.",
      502,
    );
  }
}

async function analyzeWithOpenAI({ apiKey, prompt, references, onUsage }: { apiKey: string; prompt: string; references: ReferenceImage[]; onUsage?: GenerateSectionsInput["onUsage"] }) {
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
    /*
      **출력 상한을 씌우지 않는다**(F-7-1 리뷰, 2026-09-21).

      처음에는 상세페이지의 기획 상한(32,768)을 그대로 가져왔다. 리뷰가 잡았다 —
      **여기는 원래 상한이 없었으므로 그것을 씌우는 것은 추가가 아니라 축소**다.
      게다가 Responses 의 `max_output_tokens` 는 보이는 출력 **더하기 추론
      토큰**이고, 이 모델은 추론 모델이다(추론을 다 쓰면 200 에 빈 `output_text`
      가 온다는 사실이 이 파일에 이미 적혀 있다).

      상세페이지의 32,768 은 **그쪽 기획 응답 10,463토큰을 재고** 정한 값이다.
      리디자인 분석은 입력도 출력도 다른 작업이라 그 근거를 빌려 쓸 수 없다.

      **구멍은 상한이 아니라 검사가 막는다.** 잘리면 `assertNotTruncated` 가
      잡아 값이 나가기 전에 멈춘다. 상한은 장부의 `output_tokens` 분포를 보고
      값으로 정한 뒤에 넣는다(`usage.ts` 가 그 값을 이미 보내고 있다).
    */
    body: JSON.stringify({
      model: ANALYSIS_MODEL,
      input: [{ role: "user", content }]
    })
  });

  const data = await readJsonResponse(response);
  // **상태를 싣는다.** 4xx 는 다시 시도해도 안 된다 — 아래 catch 가 갈라 준다.
  if (!response.ok) {
    throw Object.assign(new Error(withRequestId(data?.error?.message || "OpenAI 분석 요청 실패", response)), {
      status: response.status,
    });
  }
  reportUsage(onUsage, ANALYSIS_MODEL, data);
  assertNotTruncated(data, ANALYSIS_MODEL);
  const text = data.output_text || extractOpenAIText(data);
  return parseMaybeJson(text);
}

async function analyzeWithGoogle({ apiKey, prompt, references, onUsage }: { apiKey: string; prompt: string; references: ReferenceImage[]; onUsage?: GenerateSectionsInput["onUsage"] }) {
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
  if (!response.ok) {
    throw Object.assign(new Error(withRequestId(data?.error?.message || "Google 분석 요청 실패", response)), {
      status: response.status,
    });
  }
  reportUsage(onUsage, GOOGLE_READING_MODEL, data);
  assertNotTruncated(data, GOOGLE_READING_MODEL);
  const text = data?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text || "";
  return parseMaybeJson(text);
}

async function generateOpenAIImage({ apiKey, prompt, references, size }: { apiKey: string; prompt: string; references: ReferenceImage[]; size: string }) {
  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", IMAGE_QUALITY);
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
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "정밀형 생성 실패", response));
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
  if (!response.ok) throw new Error(withRequestId(data?.error?.message || "속도형 생성 실패", response));
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
    /**
     * **페이지가 몇 장짜리인가.** 이 요청이 만드는 장수(`count`)와 다른 수다.
     *
     * 리디자인은 **장마다 따로 요청한다** — 화면이 `generate(1, …)` 로 부르므로
     * `count` 는 언제나 1이다. 그 수로 「N장을 이어 붙였을 때」를 적으면 모든
     * 요청이 **「1장」**이 되어, 「한 페이지로 이어져야 한다」는 요구가 유료
     * 이미지마다 무의미해진다(2026-09-21 리뷰에서 회귀로 잡혔다).
     *
     * **모르면 숫자를 안 쓴다.** 틀린 수를 대는 것보다 안 대는 쪽이 낫다.
     */
    pageTotal?: number;
  }
): Section[] {
  // 「추가 요청사항」이 곧 사용자가 직접 친 지시다. 리디자인에는 이미 이 칸이
  // 있으므로 새 입력을 하나 더 만들지 않는다 — 두 칸이 서로 다투게 된다.
  const userInstruction = payload.request.trim();
  const lookDirective = imageLookDirective(options?.look ?? "auto");
  /*
    이 요청의 장수가 아니라 **페이지의 장수**다. 한 장씩 부르는 경로에서
    `count` 는 늘 1이라 그 수를 쓰면 「1장」이 된다.
  */
  const pageTotal = Number.isFinite(options?.pageTotal) ? Math.floor(Number(options?.pageTotal)) : count;
  const pageScopeLabel = pageTotal > 1 ? `${pageTotal}장` : "전체 상세페이지";

  return applyBlueprint(sectionTemplates(count, startSection), analysis, startSection).map((template) => {
    const facts = factsForSections(analysis);
    const isFactSection = isEvidenceSection(template);
    const factsBlock = isFactSection && facts.length
      ? `\n검증된 원본 사실(정확 표기 유지, 이 안에서만 인증/수치 사용):\n${facts.map((f) => `- ${f}`).join("\n")}\n핵심 인증/수치는 읽기 쉬운 정보 패널로 크게 배치한다(이 섹션에 한해 '작은 글씨 회피' 규칙보다 우선).`
      : "";
    const promptText = [
      // 사용자가 직접 친 말은 맨 앞과 맨 뒤에 두 번 넣는다. 2026-09-04 실측에서
      // 프롬프트 뒤에 긴 문단을 붙였더니 앞쪽 구도 지시가 밀려 무시됐다 —
      // 긴 프롬프트에서 중간 문장은 힘을 잃는다.
      userInstructionHead(userInstruction),
      // 누가 그리는가는 사용자가 친 말 다음이다. 「생성 엔진」이라고만 하면
      // 무난한 것으로 수렴한다.
      designerPersona(),
      "너는 커머스 상세페이지를 다시 그리는 사람이다.",
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
      // `JSON.stringify(undefined)` 는 `undefined` 라 그대로 자르면 터진다.
      `분석 요약: ${(JSON.stringify(analysis) ?? "{}").slice(0, 2400)}`,
      // 분석의 design_language 를 따로 뽑아 싣는다. 요약 JSON 안에 묻히면 2400자
      // 자르기에 잘려 나가고, 묻혀 있으면 지시로 읽히지 않는다.
      designLanguageBlock(analysis),
      "브랜드명 금지 규칙: '한이룸', '한이룸의', '한이룸 스킨', 'HANEERUM', 'Haneerum', 'HR'은 서비스명 또는 도구명일 뿐이며 제품 브랜드가 아니다. 이 단어들을 이미지 안의 제품명, 브랜드명, 로고, 라벨, 헤드라인, 후기, FAQ, CTA, 패키지 텍스트로 절대 사용하지 않는다.",
      "브랜드 사용 규칙: 제품 브랜드명과 제품명은 업로드된 원본 상세페이지 또는 제품 패키지에서 확인되는 이름만 사용한다. 원본에서 확인되지 않는 새 브랜드명, 새 제품명, 새 로고를 만들지 않는다.",
      `전체 연결 규칙: ${pageScopeLabel}을 이어 붙였을 때 하나의 상세페이지처럼 보여야 한다. 동일한 브랜드 색, 폰트 감각, 제품 사진 톤은 유지하되 각 섹션의 레이아웃은 반드시 다르게 구성한다. 모든 섹션이 큰 상단 헤드라인+중앙 제품컷으로 반복되면 안 된다.`,
      "섹션별 변화 규칙: 제품 위치, 정보 카드 모양, 아이콘 밀도, 배경 분할, CTA 위치, 타이포 크기 리듬을 섹션마다 다르게 한다. 같은 헤드라인 문구를 반복하지 말고, 섹션 목적에 맞는 새로운 제목을 쓴다.",
      `안전 규칙: 원본 제품컷/색감/핵심 정보는 보존한다. ${GROUNDING_RULE} 한 장에 메시지 하나만 담는다. 한국어 문구는 크게, 불릿은 3개 이하로 배치한다. 복잡한 배경과 작은 글씨를 피한다.`,
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

/**
 * **자료가 정한 구성을 얹는다**(F-7-0).
 *
 * 분석 프롬프트는 `page_blueprint` 를 만들라고 시키는데, 전에는 그것을 **한
 * 번도 안 읽고** 박아 둔 열 장(S1 히어로 … S10 최종 CTA)을 그대로 썼다.
 *
 * 그래서 무엇을 올리든 같은 구성이 나왔다. 후기가 없는 신제품에도 「S7 후기
 * 카드」가, 비교할 것이 없는 단일 상품에도 「S9 비교/보증」이 만들어진다.
 * 근거가 없으니 모델은 그 자리를 **지어내거나 비워** 둔다.
 *
 * 설계 T-PLAN: 「…원본 부족, **목적에 맞는 구성**, 새 섹션과 신뢰문구 수정」.
 *
 * ── 무엇을 안 바꾸나 ────────────────────────────────────────
 *
 * **섹션 id 와 레이아웃 지시는 그대로 둔다.**
 *
 *   · id 는 화면이 섹션을 잇는 열쇠다(`S3` 처럼). 「나머지 섹션 생성」이 빠진
 *     번호를 고르므로, 여기가 흔들리면 만든 그림이 엉뚱한 자리에 붙는다
 *   · 레이아웃 지시는 **장마다 다르게 보이게** 하는 규칙이다. 모델의 청사진은
 *     「무엇을 말할까」를 적지 「어떻게 배치할까」를 적지 않는다
 *
 * 바뀌는 것은 **무엇을 말하는 장인가**뿐이다.
 *
 * 모델이 칸 이름을 조금 다르게 줘도 받는다. 엄하게 잡으면 멀쩡한 청사진이
 * 버려지고 조용히 옛 구성으로 돌아간다.
 */
function blueprintEntries(analysis: unknown): Array<Record<string, unknown>> {
  if (!analysis || typeof analysis !== "object") return [];
  const raw = (analysis as { page_blueprint?: unknown }).page_blueprint;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}));
}

/**
 * **검증된 사실을 어느 장에 붙일까.**
 *
 * 전에는 `S4`·`S5` 라는 **자리**였다. 구성이 자료를 따라가게 되면서 그 전제가
 * 깨졌다 — 청사진이 「시험성적서」를 7번째에 두면 인증·수치가 엉뚱한 장(예:
 * 사용법)에 실리고 진짜 근거 장에는 안 실린다(2026-09-21 리뷰).
 *
 * 청사진을 얹은 장은 **이름과 목적으로** 본다. 안 얹은 장은 전처럼 자리로
 * 본다 — 박아 둔 구성의 S4·S5 가 곧 근거 장이다.
 */
const EVIDENCE_WORDS = /인증|성분|시험|수치|근거|신뢰|검사|함량|스펙|데이터|비교/;

function isEvidenceSection(template: { id: string; name: string; purpose: string; fromBlueprint?: boolean }): boolean {
  if (!template.fromBlueprint) return template.id === "S4" || template.id === "S5";
  return EVIDENCE_WORDS.test(`${template.name} ${template.purpose}`);
}

/** 이름은 한 줄이어야 한다. 프롬프트의 `섹션:` 줄과 화면 제목이 통째로 받는다. */
const BLUEPRINT_NAME_MAX = 40;
const BLUEPRINT_TEXT_MAX = 200;

/**
 * 청사진이 말하는 자리를 찾는다.
 *
 * **번호를 쓰되 따르지는 않는다.** 모델이 `S3` 라고 적어 오면 그 칸을 우리 3번
 * 자리에 얹되, 결과의 번호는 우리 것이다. 전에는 **위치로만** 얹어서, 청사진이
 * 뒤섞여 오면 「브랜드 스토리」가 히어로 레이아웃(「가장 강한 비주얼」)을 달고
 * 첫 장이 됐다(2026-09-21 리뷰).
 *
 * 번호가 없으면 전처럼 위치로 본다.
 */
function blueprintEntryFor(
  entries: Array<Record<string, unknown>>,
  sectionNumber: number,
  fallbackIndex: number,
): Record<string, unknown> | undefined {
  const 번호로 = entries.find((entry) => {
    const id = pickString(entry, ["section_id", "id"]);
    return /^S\d+$/i.test(id) && Number(id.slice(1)) === sectionNumber;
  });
  if (번호로) return 번호로;

  // 어느 칸도 번호를 안 달았을 때만 자리로 본다. 반만 달았으면 그 반은 안 얹는다.
  const 번호가있나 = entries.some((entry) => /^S\d+$/i.test(pickString(entry, ["section_id", "id"])));
  return 번호가있나 ? undefined : entries[fallbackIndex];
}

/**
 * 이름에 번호를 붙인다.
 *
 * **한 페이지 안에서 규격이 같아야 한다.** 청사진이 모자라 뒤쪽이 박아 둔
 * 이름(`S4 USP 차별점`)을 쓰면, 앞은 맨 이름이고 뒤는 번호가 붙어 섞인다.
 * 결과 화면이 이름만 찍는데 「나머지 섹션 생성」은 번호로 말하므로, 사용자가
 * 카드와 번호를 못 잇는 문제도 여기서 닫힌다.
 */
function numberedName(id: string, name: string): string {
  const 잘린것 = name.slice(0, BLUEPRINT_NAME_MAX).trim();
  // 템플릿 리터럴 안의 \b 는 컴파일 뒤 **백스페이스**가 된다. 낱말 경계는 String.raw 로.
  return new RegExp(String.raw`^${id}\b`, "i").test(잘린것) ? 잘린것 : `${id} ${잘린것}`;
}

function applyBlueprint(
  templates: ReturnType<typeof sectionTemplates>,
  analysis: unknown,
  startSection: number,
): ReturnType<typeof sectionTemplates> {
  const entries = blueprintEntries(analysis);
  if (entries.length === 0) return templates;

  return templates.map((template, index) => {
    const entry = blueprintEntryFor(entries, startSection + index, startSection - 1 + index);
    const name = entry ? pickString(entry, ["name", "title", "section_name", "label", "heading"]) : "";
    if (!entry || !name) return template;

    return {
      ...template,
      name: numberedName(template.id, name),
      purpose: (pickString(entry, ["purpose", "goal", "objective", "intent", "summary"]) || template.purpose)
        .slice(0, BLUEPRINT_TEXT_MAX),
      source: (pickString(entry, ["source", "evidence", "content", "material", "basis"]) || template.source)
        .slice(0, BLUEPRINT_TEXT_MAX),
      /** 이 장이 근거를 말하는 장인가. 검증된 사실 블록이 여기 붙는다. */
      fromBlueprint: true,
    };
  });
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
    return { provider: "google" as const, label: "속도형", id: GOOGLE_NANO_BANANA_2_MODEL };
  }
  return { provider: "openai" as const, label: "정밀형", id: OPENAI_IMAGE_MODEL };
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
      "정밀형 사용 권한이 아직 없습니다.",
      "이 모델은 OpenAI 조직 인증이 필요합니다.",
      "OpenAI Platform > Settings > Organization > General에서 Verify Organization을 완료한 뒤 15분 정도 기다려주세요.",
      message.match(/request_id: [^)]+/)?.[0] || ""
    ].filter(Boolean).join(" ");
  }
  if (message.includes("Invalid image file or mode")) {
    return [
      "업로드 이미지 형식이 정밀형 편집 입력과 맞지 않습니다.",
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
