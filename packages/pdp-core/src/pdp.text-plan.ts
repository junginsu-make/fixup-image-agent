import { GoogleGenAI, Type } from "@google/genai";
import { PdpServiceError } from "./pdp.service";
import { generateImageViaFal } from "./pdp.image-provider";
import {
  REVIEW_SCHEMA,
  buildReviewPrompt,
  buildRevisionDirective,
  needsRevision,
  normalizeReview,
} from "./pdp.review";
import { SALES_PRINCIPLES } from "./pdp.sales-principles";
import { gapPolicyRules, intensityRules } from "./pdp.copy-intensity";
import { resolveStructureFailures, verifyEvidenceStructure } from "./pdp.evidence";
import type { StructureFailure } from "./pdp.evidence";
import { DEFAULT_IMAGE_MODEL } from "./types";
import type {
  AspectRatio,
  CopyEvidence,
  CopyIntensity,
  CopyTarget,
  DesignSystem,
  EvidenceKind,
  GapPolicy,
  KeyVisualRequest,
  LandingPageBlueprint,
  OfferingKind,
  PdpOutputMode,
  ProductBrief,
  SectionBlueprint,
  TextPlanRequest,
  TextPlanResult,
} from "./types";

/**
 * 텍스트 기반 상세페이지 진입.
 *
 * 이미지 없이 자유 텍스트로 시작하는 경로다. 주 대상이 무형 상품·서비스라
 * "제품 컷"이 없고, 섹션 이미지의 시각 앵커는 시나리오 확정 후 만드는
 * 대표 이미지가 맡는다.
 *
 * pdp.service.ts 는 수정하지 않는다. 그 파일의 responseSchema 와 정규화 로직은
 * 비공개라 재사용할 수 없어 여기서 다시 구현한다. 자세한 근거는
 * docs/superpowers/specs/2026-07-27-text-based-pdp-design.md 4.1 참조.
 */

const BRIEF_MODEL = "gemini-3.1-pro-preview";
const BLUEPRINT_MODEL = "gemini-3.1-pro-preview";
const REVIEW_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_IMAGE_MIME = "image/jpeg";

/**
 * 구성안을 다시 만드는 최대 횟수.
 *
 * 계속 미달이어도 무한히 돌면 안 된다. 재생성 한 번에 구성안 호출 1회 +
 * 심사 호출 1회가 더 붙는다. 2회면 최악 5회 호출로 끝난다.
 */
export const MAX_BLUEPRINT_REVISIONS = 2;

/**
 * 재생성을 더 시도할지 판단하는 시간 예산.
 *
 * 라우트의 함수 상한이 300초다(플랫폼 상한이라 못 올린다). 실측으로 호출 하나가
 * 약 35초라, 최악(7회 호출)이면 250초에 닿는다. 상한에 걸려 함수가 죽으면
 * 4분 기다린 사용자가 아무것도 못 받는다. 미달인 채로 돌려주는 편이 낫다.
 */
export const REVISION_TIME_BUDGET_MS = 150_000;

const OFFERING_KINDS: readonly OfferingKind[] = [
  "course",
  "coaching",
  "subscription",
  "software",
  "community",
  "other",
];

type GeneratedImagePayload = { base64: string; mimeType: string };

/**
 * 외부 호출을 한 곳으로 모아 테스트에서 주입할 수 있게 한다.
 * 기본 구현은 apiKey 로 Gemini 를 직접 호출한다.
 */
export interface TextPlanDeps {
  generateJson(prompt: string, schema: unknown, model: string): Promise<unknown>;
  generateImage(prompt: string, aspectRatio: AspectRatio): Promise<GeneratedImagePayload | null>;
}

// ── 프롬프트 ────────────────────────────────────────────────────

const BRIEF_RULES = `규칙:
- 입력이 짧아도 되묻지 말고 합리적으로 채운다. 정보 부족은 실패가 아니다.
- 입력에 없어서 네가 추정한 항목은 모두 assumptions 에 한국어 한 줄씩 적는다.
  사용자는 이 목록을 보고 교정하므로 빠뜨리면 안 된다.
- 무엇을 파는지 자체를 판단할 수 없으면 offeringName 을 빈 문자열로 둔다.
  이때만 실패로 처리된다. 짧다는 이유로 비우지 마라.
- offeringKind 는 다음 중 하나: ${OFFERING_KINDS.join(", ")}.
- 모든 문자열은 한국어로 쓴다.`;

export function buildBriefPrompt(text: string) {
  return `너는 무형 상품(강의·코칭·구독·소프트웨어·커뮤니티)의 판매 기획자다.
사용자가 규칙 없이 쓴 아래 텍스트에서 판매 브리프를 뽑아낸다.

${BRIEF_RULES}

[사용자 입력]
${text}`;
}

function outputModeRules(outputMode: PdpOutputMode) {
  return outputMode === "full-image"
    ? `[출력 모드: 통이미지(full-image)]
- 각 섹션 이미지에 한국어 카피가 직접 렌더된다.
- headline/subheadline 은 이미지 위에서 읽히도록 짧고 강하게 쓴다.
- CTA 와 CTA_en 은 빈 문자열로 둔다. 이미지에 그리면 눌리지 않는 그림 버튼이 된다
  (사용자 결정 2026-07-30). 실제 구매 버튼은 쇼핑몰이 붙인다.`
    : `[출력 모드: 텍스트편집(editable)]
- 섹션 이미지에는 글자를 넣지 않는다. 카피는 편집기에서 얹는다.
- prompt_en 에 "이미지 내에 텍스트, 로고, 워터마크를 넣지 말 것"을 반영한다.
- CTA 와 CTA_en 은 빈 문자열로 둔다. 편집기에 얹는 길이 없어 쓰이지 않는다
  (사용자 결정 2026-07-30). 실제 구매 버튼은 쇼핑몰이 붙인다.`;
}

const BLUEPRINT_RULES = `규칙:
- designSystem 은 페이지 전체가 공유하는 디자인 규칙이다. **한 번만** 정하고 전체 섹션이 공유한다.
  섹션 이미지는 각각 따로 생성되므로 여기서 정하지 않으면 섹션마다 폰트와 인물이 달라진다.
  · headlineFont / bodyFont: 한국어 서체 성격을 한국어로 묘사한다(예: "굵은 기하학적 산세리프",
    "가늘고 단정한 산세리프"). 그림처럼 쓰는 레터링이 아닌 한 페이지 안에서 서체는 바뀌지 않는다.
  · palette: 배경·본문·강조 3색을 한국어로 적는다.
  · cast: 페이지에 반복 등장할 인물 한 명을 구체적으로 묘사한다(나이대, 성별, 머리, 옷차림).
    한국인으로 쓴다. 모든 섹션에 같은 사람이 나온다는 전제로 작성한다.
- 무형 상품이다. 만질 수 있는 제품 사진을 전제하지 마라.
  이미지 방향은 사용 장면·결과 장면·감정·은유로 잡는다.
- 섹션은 4~7개. 앞 섹션의 감정을 다음 섹션이 이어받아 하나의 흐름을 만든다.
- section_name 은 내부 역할명이며 한국어로 쓴다("문제 제기", "반론 해소" 처럼).
  화면에 그대로 라벨로 표시되므로 Intro/Solution 같은 영어를 쓰지 마라.
  단, 이 역할명을 headline/subheadline/bullets 안에 그대로 옮겨 쓰지는 마라.
- prompt_en 은 반드시 영어로, 촬영 가능한 장면 묘사로 쓴다. 비우지 마라.
- prompt_ko 는 같은 장면을 한국어로 한 줄 요약한다. 사용자가 이걸 보고 고친다.
- layout_notes 는 그 섹션의 화면 구성을 한국어로 짧게 적는다. **섹션마다 반드시 다르게** 쓴다.
  예: 텍스트 상단·이미지 하단 / 이미지 전면에 텍스트 오버레이 / 좌우 2단 분할 /
      중앙 대형 숫자 + 주변 여백 / 대각선 구성 / 클로즈업 위 하단 캡션 블록.
  같은 구성이 연달아 두 번 나오면 안 된다. 전체가 한 장짜리 템플릿처럼 보이면 실패다.
- 밝기 흐름: 문제를 다루는 섹션만 어둡거나 차분해도 되고, 해결·혜택·마무리 섹션은
  밝고 개운한 톤으로 잡는다. 페이지 전체가 어둡게 깔리면 안 된다.
- 인물과 장소는 한국을 전제한다. prompt_en 에 사람이 등장하면 반드시 Korean 으로
  명시하고, 공간도 한국에서 볼 법한 곳으로 쓴다.
- 장면은 실제로 촬영 가능한 사진이어야 한다. 3D 렌더, 일러스트, 흔한 스톡 사진 같은
  묘사는 쓰지 않는다.
- 구도를 섹션마다 다르게 잡는다. 클로즈업, 광각 환경컷, 오버더숄더, 탑다운, 로우앵글을
  메시지에 맞게 골라 쓰고 같은 앵글을 반복하지 않는다.
- headline/subheadline/bullets/CTA 는 한국어, *_en 은 자연스러운 영어 번역.`;

const COPY_EVIDENCE_RULES = `[근거 딱지]
- 각 섹션의 evidenceVersion은 코드가 1로 지정한다. evidence 배열만 작성한다.
- 대상은 headline, subheadline, bullets의 각 항목, trust_or_objection_line, CTA, prompt_ko다. prompt_en은 근거 대상이 아니다.
- 비어 있지 않은 각 대상에는 evidence를 붙인다. 문장 하나(target)에 근거는 하나만 단다.
- target은 문자열 경로가 아니라 { "slot": "headline" } 또는 { "slot": "bullet", "index": 0 } 형태로 쓴다.
- value는 대상의 현재 문구와 글자 단위로 같아야 한다.
- kind는 quoted, rhetoric, ask, sample 중 하나만 쓴다. user는 모델이 만들 수 없다.
- 사용자의 원문에 그대로 있는 주장은 quoted로 표시하고 quote에 원문 일부를 정확히 복사한다.
- 사실 주장이 아닌 질문·감정·전환 문구는 rhetoric으로 표시한다.
- 사용자에게 확인할 사실은 값을 비우고 ask로 표시하며 note에 질문을 적는다.
- 한 문장에 여러 성격이 섞이면 가장 위험한 것을 고른다. 위험 순서는 sample > ask > quoted > rhetoric이다.
- 예: 인용한 사실과 네가 채운 수치가 한 문장에 함께 있으면 그 문장은 sample이다.`;

export function buildTextBlueprintPrompt(
  brief: ProductBrief,
  desiredTone?: string,
  outputMode: PdpOutputMode = "editable",
  revisionDirective = "",
  copyIntensity: CopyIntensity = "normal",
  gapPolicy: GapPolicy = "ask",
) {
  // 지적사항은 규칙보다 앞에 둔다. 뒤에 붙이면 긴 규칙에 묻혀 무시된다.
  const revision = revisionDirective ? `${revisionDirective}\n\n` : "";

  return `너는 상세페이지 기획자다. 아래 브리프로 상세페이지 구성안을 설계한다.

${revision}${outputModeRules(outputMode)}

${intensityRules(copyIntensity)}

${gapPolicyRules(gapPolicy)}

${SALES_PRINCIPLES}

${BLUEPRINT_RULES}

${COPY_EVIDENCE_RULES}

[브리프]
상품명: ${brief.offeringName}
유형: ${brief.offeringKind}
한 줄 소개: ${brief.oneLiner}
대상: ${brief.audience}
문제: ${brief.problem}
기대 결과: ${brief.outcome}
차별점: ${brief.differentiators.join(" / ")}
예상 반론: ${brief.objections.join(" / ")}
가격 포지션: ${brief.pricePositioning}
톤: ${desiredTone || brief.tone}

[사용자 원문]
${brief.sourceText}`;
}

export function buildKeyVisualPrompt(brief: ProductBrief, blueprint: LandingPageBlueprint) {
  // 섹션 1의 장면을 쓰면 안 된다. 그 자리는 거의 항상 "문제 제기"라 어둡고 부정적인데,
  // 앵커가 어두우면 뒤따르는 모든 섹션이 그 색·조명을 물려받아 페이지 전체가 침침해진다.
  // 대신 브리프의 기대 결과(outcome)와 톤에서 브랜드 무드를 만든다.
  const styleHints = blueprint.sections
    .map((section) => section.style_guide)
    .filter(Boolean)
    .slice(0, 2)
    .join(". ");

  return `Create a single key visual that establishes the visual identity for a landing page.

Offering: ${brief.offeringName} — ${brief.oneLiner}
Audience: ${brief.audience}
The feeling to land on: ${brief.outcome}
Mood: ${brief.tone}
${styleHints ? `Style hints: ${styleHints}` : ""}

Show the world *after* the problem is solved — the relief, the result, the better
state. Do not depict the pain, the struggle, or the "before" situation.

Light and colour: bright, clean and premium. Favour daylight or warm even light,
a light or mid-tone background, and generous negative space. Avoid gloomy night
scenes, heavy shadows, desaturated greys and depressing atmospheres.

This is a style anchor, not a deliverable. Every later section image inherits its
palette, lighting and texture from this frame, so keep it clean and consistent.
Do NOT include any text, letters, numbers, logos or watermarks anywhere in the image.`;
}

// ── 정규화 ──────────────────────────────────────────────────────

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : [];
}

function asOfferingKind(value: unknown): OfferingKind {
  const candidate = asString(value) as OfferingKind;
  return OFFERING_KINDS.includes(candidate) ? candidate : "other";
}

const COPY_SLOTS = [
  "headline",
  "subheadline",
  "trust_or_objection_line",
  "CTA",
  "prompt_ko",
] as const;

function normalizeCopyTarget(value: unknown): CopyTarget | null {
  const target = (value ?? {}) as Record<string, unknown>;
  const slot = asString(target.slot);
  if (slot === "bullet") {
    return Number.isInteger(target.index) && Number(target.index) >= 0
      ? { slot, index: Number(target.index) }
      : null;
  }
  return COPY_SLOTS.includes(slot as (typeof COPY_SLOTS)[number])
    ? { slot: slot as (typeof COPY_SLOTS)[number] }
    : null;
}

function normalizeEvidenceKind(value: unknown): EvidenceKind {
  const kind = asString(value) as EvidenceKind;
  if (kind === "user") return "sample";
  return ["quoted", "rhetoric", "sample", "ask"].includes(kind) ? kind : "sample";
}

function normalizeEvidence(value: unknown): CopyEvidence | null {
  const input = (value ?? {}) as Record<string, unknown>;
  const target = normalizeCopyTarget(input.target);
  if (!target) return null;
  const quote = asString(input.quote);
  const note = asString(input.note);
  return {
    target,
    value: asString(input.value),
    kind: normalizeEvidenceKind(input.kind),
    ...(quote ? { quote } : {}),
    ...(note ? { note } : {}),
  };
}

export function normalizeBrief(raw: unknown, sourceText: string): ProductBrief {
  const input = (raw ?? {}) as Record<string, unknown>;

  return {
    offeringName: asString(input.offeringName),
    offeringKind: asOfferingKind(input.offeringKind),
    oneLiner: asString(input.oneLiner),
    audience: asString(input.audience),
    problem: asString(input.problem),
    outcome: asString(input.outcome),
    differentiators: asStringArray(input.differentiators),
    objections: asStringArray(input.objections),
    pricePositioning: asString(input.pricePositioning),
    tone: asString(input.tone),
    assumptions: asStringArray(input.assumptions),
    sourceText,
  };
}

function normalizeSection(raw: Record<string, unknown>, index: number): SectionBlueprint {
  const headline = asString(raw.headline);
  const promptKo = asString(raw.prompt_ko);
  const bullets = asStringArray(raw.bullets);
  const bulletsEn = asStringArray(raw.bullets_en);
  const trustLine = asString(raw.trust_or_objection_line);
  const cta = asString(raw.CTA);
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(normalizeEvidence).filter((item): item is CopyEvidence => item !== null)
    : [];

  return {
    section_id: asString(raw.section_id) || `S${index + 1}`,
    section_name: asString(raw.section_name) || `섹션 ${index + 1}`,
    goal: asString(raw.goal),
    headline,
    headline_en: asString(raw.headline_en) || headline,
    subheadline: asString(raw.subheadline),
    subheadline_en: asString(raw.subheadline_en) || asString(raw.subheadline),
    bullets,
    bullets_en: bulletsEn.length > 0 ? bulletsEn : bullets,
    trust_or_objection_line: trustLine,
    trust_or_objection_line_en: asString(raw.trust_or_objection_line_en) || trustLine,
    CTA: cta,
    CTA_en: asString(raw.CTA_en) || cta,
    layout_notes: asString(raw.layout_notes),
    compliance_notes: asString(raw.compliance_notes),
    image_id: asString(raw.image_id) || `IMG_S${index + 1}`,
    purpose: asString(raw.purpose),
    prompt_ko: promptKo,
    // 비면 generateSectionImage 가 INVALID_REQUEST 로 거부한다(pdp.service.ts:340).
    // 시나리오 단계에서 막다른 길을 만들지 않도록 반드시 채운다.
    prompt_en: asString(raw.prompt_en) || promptKo || headline,
    negative_prompt: asString(raw.negative_prompt),
    style_guide: asString(raw.style_guide),
    reference_usage: asString(raw.reference_usage),
    evidenceVersion: 1,
    evidence,
  };
}

function normalizeDesignSystem(raw: unknown): DesignSystem | undefined {
  const input = (raw ?? {}) as Record<string, unknown>;
  const system: DesignSystem = {
    headlineFont: asString(input.headlineFont),
    bodyFont: asString(input.bodyFont),
    palette: asStringArray(input.palette),
    cast: asString(input.cast),
  };
  const empty =
    !system.headlineFont && !system.bodyFont && !system.palette.length && !system.cast;
  return empty ? undefined : system;
}

/**
 * 공용 디자인 규칙을 모든 섹션이 똑같이 받도록 문장으로 만든다.
 * buildImagePrompt 가 style_guide 를 그대로 프롬프트에 넣으므로(pdp.service.ts:1177)
 * 별도 배관 없이 전 섹션에 같은 지시가 전달된다.
 */
function describeDesignSystem(system: DesignSystem) {
  return [
    "[페이지 공용 디자인 시스템 — 모든 섹션이 동일하게 따른다]",
    system.headlineFont ? `헤드라인 서체: ${system.headlineFont}` : "",
    system.bodyFont ? `본문 서체: ${system.bodyFont}` : "",
    system.palette.length ? `색 팔레트: ${system.palette.join(" / ")}` : "",
    system.cast ? `반복 등장 인물: ${system.cast} — 모든 섹션에 같은 사람이 나온다` : "",
    "이 값들은 섹션마다 바뀌면 안 된다.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function normalizeTextBlueprint(raw: unknown): LandingPageBlueprint {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rawSections = Array.isArray(input.sections) ? input.sections : [];

  if (rawSections.length === 0) {
    throw new PdpServiceError(
      "INVALID_REQUEST",
      "구성안을 만들지 못했습니다. 다시 시도해 주세요.",
      "no sections returned from blueprint model",
    );
  }

  const designSystem = normalizeDesignSystem(input.designSystem);
  const shared = designSystem ? describeDesignSystem(designSystem) : "";

  const sections = rawSections
    .map((section, index) => normalizeSection((section ?? {}) as Record<string, unknown>, index))
    .map((section) =>
      shared
        ? { ...section, style_guide: [section.style_guide, shared].filter(Boolean).join(" ") }
        : section,
    );
  const scorecard = Array.isArray(input.scorecard) ? input.scorecard : [];
  const blueprintList = asStringArray(input.blueprintList);

  return {
    designSystem,
    executiveSummary: asString(input.executiveSummary),
    scorecard: scorecard.map((item) => {
      const entry = (item ?? {}) as Record<string, unknown>;
      return {
        category: asString(entry.category),
        score: asString(entry.score),
        reason: asString(entry.reason),
      };
    }),
    blueprintList:
      blueprintList.length > 0 ? blueprintList : sections.map((section) => section.section_name),
    sections,
  };
}

// ── 이미지 방향 병합 ────────────────────────────────────────────

const ART_DIRECTION_MARKER = "\n\nArt direction override (Korean, follow this): ";

/**
 * 시나리오에서 고친 한국어 이미지 방향을 실제 생성에 쓰이는 prompt_en 에 반영한다.
 *
 * 이미지 생성은 prompt_en 만 본다. 사용자가 한국어 방향을 고쳤는데 무시되면
 * 막다른 길이 되므로, 원본과 달라진 섹션에만 추가 지시를 덧붙인다.
 * 여러 번 고쳐도 지시가 쌓이지 않도록 이전 지시는 잘라내고 다시 붙인다.
 */
export function mergeArtDirection(
  original: LandingPageBlueprint,
  edited: LandingPageBlueprint,
): LandingPageBlueprint {
  const originals = new Map(original.sections.map((section) => [section.section_id, section]));

  return {
    ...edited,
    sections: edited.sections.map((section) => {
      const base = originals.get(section.section_id);
      const promptKo = section.prompt_ko.trim();

      // 사용자가 새로 추가한 섹션. 한국어 방향이 유일한 단서다.
      if (!base) {
        return section.prompt_en.trim()
          ? section
          : { ...section, prompt_en: promptKo };
      }

      if (promptKo === base.prompt_ko.trim()) {
        return { ...section, prompt_en: base.prompt_en };
      }

      const basePromptEn = base.prompt_en.split(ART_DIRECTION_MARKER)[0];
      return {
        ...section,
        prompt_en: promptKo ? `${basePromptEn}${ART_DIRECTION_MARKER}${promptKo}` : basePromptEn,
      };
    }),
  };
}

// ── 스키마 ──────────────────────────────────────────────────────

const BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offeringName: { type: Type.STRING },
    offeringKind: { type: Type.STRING },
    oneLiner: { type: Type.STRING },
    audience: { type: Type.STRING },
    problem: { type: Type.STRING },
    outcome: { type: Type.STRING },
    differentiators: { type: Type.ARRAY, items: { type: Type.STRING } },
    objections: { type: Type.ARRAY, items: { type: Type.STRING } },
    pricePositioning: { type: Type.STRING },
    tone: { type: Type.STRING },
    assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
};

const SECTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    section_id: { type: Type.STRING },
    section_name: { type: Type.STRING },
    goal: { type: Type.STRING },
    headline: { type: Type.STRING },
    headline_en: { type: Type.STRING },
    subheadline: { type: Type.STRING },
    subheadline_en: { type: Type.STRING },
    bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
    bullets_en: { type: Type.ARRAY, items: { type: Type.STRING } },
    trust_or_objection_line: { type: Type.STRING },
    trust_or_objection_line_en: { type: Type.STRING },
    CTA: { type: Type.STRING },
    CTA_en: { type: Type.STRING },
    layout_notes: { type: Type.STRING },
    compliance_notes: { type: Type.STRING },
    image_id: { type: Type.STRING },
    purpose: { type: Type.STRING },
    prompt_ko: { type: Type.STRING },
    prompt_en: { type: Type.STRING },
    negative_prompt: { type: Type.STRING },
    style_guide: { type: Type.STRING },
    reference_usage: { type: Type.STRING },
    evidence: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          target: {
            type: Type.OBJECT,
            properties: {
              slot: { type: Type.STRING },
              index: { type: Type.NUMBER },
            },
          },
          value: { type: Type.STRING },
          kind: { type: Type.STRING },
          quote: { type: Type.STRING },
          note: { type: Type.STRING },
        },
      },
    },
  },
};

const DESIGN_SYSTEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headlineFont: { type: Type.STRING },
    bodyFont: { type: Type.STRING },
    palette: { type: Type.ARRAY, items: { type: Type.STRING } },
    cast: { type: Type.STRING },
  },
};

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    designSystem: DESIGN_SYSTEM_SCHEMA,
    executiveSummary: { type: Type.STRING },
    scorecard: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          score: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
      },
    },
    blueprintList: { type: Type.ARRAY, items: { type: Type.STRING } },
    sections: { type: Type.ARRAY, items: SECTION_SCHEMA },
  },
};

// ── 기본 구현 ───────────────────────────────────────────────────

function requireApiKey(apiKey?: string) {
  // GOOGLE_API_KEY 를 먼저 본다. 이름이 여러 개면 어느 쪽이 이기는지가 파일마다
  // 달라지고, 두 키를 다르게 넣은 순간 경로마다 다른 키를 쓰게 된다.
  // apps/web/lib/server-keys.ts 와 같은 순서다.
  const resolved = apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!resolved) {
    throw new PdpServiceError("GEMINI_API_KEY_MISSING", "AI 공급자 키가 설정되지 않았습니다.");
  }
  return resolved;
}

function parseJsonText(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "AI 응답을 해석하지 못했습니다.",
      "response was not valid JSON",
    );
  }
}

function createDefaultDeps(apiKey?: string): TextPlanDeps {
  const client = new GoogleGenAI({ apiKey: requireApiKey(apiKey) });

  return {
    async generateJson(prompt, schema, model) {
      const response = await client.models.generateContent({
        model,
        contents: [{ parts: [{ text: prompt }] }] as never,
        config: { responseMimeType: "application/json", responseSchema: schema as never },
      });
      return parseJsonText(response.text ?? "");
    },

    // 이미지 생성은 fal 을 경유한다. Gemini 클라이언트는 텍스트(브리프·구성안)에만 쓴다.
    async generateImage(prompt, aspectRatio) {
      return generateImageViaFal(DEFAULT_IMAGE_MODEL, {
        prompt,
        systemPrompt: "",
        aspectRatio,
        references: [],
      });
    },
  };
}

// ── 공개 API ────────────────────────────────────────────────────

/**
 * 자유 텍스트 → 판매 브리프 → 상세페이지 구성안.
 *
 * 되묻지 않는다. 정보가 얇으면 브리프의 assumptions 에 추정 내역이 담기고,
 * 사용자는 시나리오 화면에서 그것을 보고 교정한다.
 */
export interface TextPlanClock {
  /** 시간 예산 판단용. 테스트에서 갈아 끼운다. */
  now: () => number;
}

function buildEvidenceRevisionDirective(failures: StructureFailure[]): string {
  const details = failures
    .map((failure) => {
      const target = failure.target
        ? failure.target.slot === "bullet"
          ? `bullet[${failure.target.index}]`
          : failure.target.slot
        : "section";
      return `${failure.sectionId}.${target}: ${failure.reason}`;
    })
    .join("\n");
  return `[근거 구조 수정]
아래 근거 구조 오류만 고친 완전한 구성안을 다시 작성하라. 문구와 evidence.value를 정확히 일치시켜라.
${details}`;
}

export async function planFromText(
  input: TextPlanRequest,
  apiKey?: string,
  deps?: TextPlanDeps,
  clock: TextPlanClock = { now: () => Date.now() },
): Promise<TextPlanResult> {
  const sourceText = (input.text ?? "").trim();
  if (!sourceText) {
    throw new PdpServiceError(
      "TEXT_INPUT_INSUFFICIENT",
      "무엇을 판매하시는지 알려주세요.",
      "empty input text",
    );
  }

  const resolved = deps ?? createDefaultDeps(apiKey);
  const brief = normalizeBrief(
    await resolved.generateJson(buildBriefPrompt(sourceText), BRIEF_SCHEMA, BRIEF_MODEL),
    sourceText,
  );

  if (!brief.offeringName) {
    throw new PdpServiceError(
      "TEXT_INPUT_INSUFFICIENT",
      "무엇을 판매하시는지 파악하지 못했습니다. 상품이나 서비스를 한 줄로 알려주세요.",
      "model could not identify an offering",
    );
  }

  const outputMode = input.outputMode ?? "editable";
  const makeBlueprint = async (revisionDirective: string) =>
    normalizeTextBlueprint(
      await resolved.generateJson(
        buildTextBlueprintPrompt(
          brief,
          input.desiredTone,
          outputMode,
          revisionDirective,
          input.copyIntensity,
          input.gapPolicy,
        ),
        BLUEPRINT_SCHEMA,
        BLUEPRINT_MODEL,
      ),
    );

  // 심사는 품질을 올리려는 장치다. 그것 때문에 생성 자체가 죽으면 손해가 더 크다.
  // 실패하면 심사 없이 진행한다 — 심사를 붙이기 전과 같은 상태가 된다.
  const runReview = async (candidate: LandingPageBlueprint) => {
    try {
      return normalizeReview(
        await resolved.generateJson(
          buildReviewPrompt(candidate, SALES_PRINCIPLES),
          REVIEW_SCHEMA,
          REVIEW_MODEL,
        ),
      );
    } catch {
      return null;
    }
  };

  const startedAt = clock.now();
  let blueprint = await makeBlueprint("");
  let structureFailures = verifyEvidenceStructure(blueprint, sourceText);
  let review = await runReview(blueprint);

  for (let revision = 0; revision < MAX_BLUEPRINT_REVISIONS; revision += 1) {
    const reviewNeedsRevision = Boolean(review && needsRevision(review));
    if (structureFailures.length === 0 && !reviewNeedsRevision) break;
    // 한 번 더 돌릴 시간이 없으면 미달인 채로 돌려준다. 함수가 상한에 걸려
    // 죽으면 사용자는 몇 분을 기다리고도 아무것도 못 받는다.
    if (clock.now() - startedAt > REVISION_TIME_BUDGET_MS) break;
    const revisionDirective = structureFailures.length
      ? buildEvidenceRevisionDirective(structureFailures)
      : buildRevisionDirective(review!);
    blueprint = await makeBlueprint(revisionDirective);
    structureFailures = verifyEvidenceStructure(blueprint, sourceText);
    review = await runReview(blueprint);
  }

  if (structureFailures.length > 0) {
    // 정책을 넘긴다. 예시로 채우기를 고른 사용자에게 빈 페이지를 주면 안 된다.
    blueprint = resolveStructureFailures(blueprint, structureFailures, input.gapPolicy ?? "ask");
  }

  return { brief, blueprint, ...(review ? { review } : {}) };
}

/** 섹션 이미지들의 색·조명·질감을 묶는 대표 이미지 1장. 항상 텍스트 없이 만든다. */
export async function generateKeyVisual(
  input: KeyVisualRequest,
  apiKey?: string,
  deps?: TextPlanDeps,
): Promise<{ imageBase64: string; mimeType: string }> {
  if (!input?.brief?.offeringName || !input.blueprint?.sections?.length) {
    throw new PdpServiceError(
      "INVALID_REQUEST",
      "대표 이미지를 만들 정보가 부족합니다. 시나리오를 먼저 만들어 주세요.",
      "key visual requires a brief and at least one section",
    );
  }

  // 대표 이미지도 섹션과 같은 모델로 만들어야 톤이 이어진다.
  const image = deps
    ? await deps.generateImage(buildKeyVisualPrompt(input.brief, input.blueprint), input.aspectRatio)
    : await generateImageViaFal(input.imageModel ?? DEFAULT_IMAGE_MODEL, {
        prompt: buildKeyVisualPrompt(input.brief, input.blueprint),
        systemPrompt: "",
        aspectRatio: input.aspectRatio,
        references: [],
      }).then((r) => ({ base64: r.base64, mimeType: r.mimeType }));

  if (!image?.base64) {
    throw new PdpServiceError(
      "PDP_IMAGE_GENERATION_FAILED",
      "대표 이미지를 만들지 못했습니다. 다시 시도해 주세요.",
      "key visual response contained no image",
    );
  }

  return { imageBase64: image.base64, mimeType: image.mimeType || DEFAULT_IMAGE_MIME };
}
