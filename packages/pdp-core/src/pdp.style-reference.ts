import { Type } from "./pdp.llm";
import type { PdpLlm } from "./pdp.llm";
import type { ProductBrief } from "./types";

/**
 * 스타일 레퍼런스 — 페이지의 디자인 언어를 정하는 참조 이미지 한 장.
 *
 * 레퍼런스 한 장이 결과를 얼마나 바꾸는지 먼저 쟀다. 같은 프롬프트에서
 * 색(크림 → 네이비+옐로)과 서체(가는 명조 → 굵은 압축 산세리프)가 통째로
 * 바뀌었고, 레퍼런스의 장식 요소까지 옮겨왔다. 텍스트로 정한 designSystem
 * 보다 힘이 세다.
 *
 * 그래서 두 가지를 지킨다.
 *  - 레퍼런스는 **페이지당 한 장**이다. 섹션마다 다른 것을 뽑으면 designSystem
 *    으로 맞춰 놓은 섹션 간 통일이 그대로 깨진다.
 *  - 어울리지 않으면 **아무것도 쓰지 않는다**. 강도가 "디자인 전체"라
 *    엉뚱한 레퍼런스는 없느니만 못하다.
 *
 * 이 파일은 DB 를 모른다. 저장·검색은 redesign-core 가, 둘을 잇는 것은 라우트가 한다.
 */

/**
 * 유사도 하한.
 *
 * 검색 대상이 디자인 특성 서술이라 판매 지식보다 어휘가 좁다. 한국어
 * text-embedding-3-small 에서 관련 있는 쌍이 0.4~0.6, 무관한 쌍이 0.1~0.25 에
 * 나오는 것을 프로젝트 G 에서 확인했다. 그 사이에 둔다.
 */
export const MIN_STYLE_SIMILARITY = 0.35;

export interface StyleReferenceMatch {
  id: string;
  name: string;
  /** Gemini 가 읽어낸 디자인 특성 서술. 검색 대상이자 프롬프트에 함께 싣는 값. */
  description: string;
  imageBase64: string;
  mimeType: string;
  similarity: number;
}

export interface StyleAnalysis {
  palette?: string;
  typography?: string;
  composition?: string;
  mood?: string;
  suitedFor?: string;
}

/**
 * 브리프에서 검색 질의를 만든다.
 *
 * 사용자 원문을 통째로 넣지 않는다. 검색 대상이 디자인 특성 서술인데 원문을
 * 넣으면 상품 사실관계(지명·공정·수치)가 질의를 지배해서, 디자인이 아니라
 * 품목이 비슷한 것을 끌어온다.
 */
export function buildStyleQuery(brief: ProductBrief, desiredTone?: string) {
  return [
    `상품: ${brief.offeringName}`,
    `한 줄 소개: ${brief.oneLiner}`,
    `대상: ${brief.audience}`,
    `가격 포지션: ${brief.pricePositioning}`,
    `원하는 인상: ${desiredTone || brief.tone}`,
  ].join("\n");
}

/** 가장 비슷한 한 장. 하한 미달뿐이면 아무것도 고르지 않는다. */
export function pickStyleReference(
  candidates: readonly StyleReferenceMatch[],
): StyleReferenceMatch | null {
  let best: StyleReferenceMatch | null = null;

  for (const candidate of candidates) {
    if (candidate.similarity < MIN_STYLE_SIMILARITY) continue;
    if (!best || candidate.similarity > best.similarity) best = candidate;
  }

  return best;
}

const ANALYSIS_FIELDS: Array<{ key: keyof StyleAnalysis; label: string }> = [
  { key: "palette", label: "팔레트" },
  { key: "typography", label: "서체" },
  { key: "composition", label: "구성" },
  { key: "mood", label: "분위기" },
  { key: "suitedFor", label: "어울리는 상품군" },
];

export function buildStyleAnalysisPrompt(imageCount = 1) {
  // 조각으로 들어오면 그것부터 말해 준다. 안 그러면 서로 다른 그림 넷으로 읽고
  // 「여러 디자인이 섞였다」는 서술이 나온다 — 자동 추천이 그 말을 믿는다.
  const 조각안내 =
    imageCount > 1
      ? `

이미지 ${imageCount}장은 **한 장의 긴 상세페이지를 위에서 아래로 자른 조각**이다. 서로 다른 그림이 아니라 한 페이지다. 전체를 하나로 보고 적어라.`
      : "";

  return `이 이미지의 **디자인**을 읽어라.${조각안내}

무엇이 찍혔는지(피사체·사물·장소)는 적지 마라. 나중에 "차분한 프리미엄 식품"
같은 말로 이 이미지를 찾아낼 수 있도록, 디자인 특성만 한국어로 적는다.

- 팔레트: 실제로 쓰인 색을 구체적으로. 배경색, 본문색, 강조색
- 서체: 굵기·너비·성격. 명조 계열인지 산세리프인지, 압축된 형태인지
- 구성: 요소를 어떻게 배치했는지. 여백은 어떻게 썼는지
- 분위기: 보는 사람이 받는 인상
- 상품군: 이 디자인이 어울릴 상품 유형

항목마다 한 문장씩. 없으면 빈 문자열.`;
}

/** 분석 결과를 임베딩·표시에 쓸 한 덩이 서술로 만든다. */
export function normalizeStyleAnalysis(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";

  const source = raw as Record<string, unknown>;
  const lines: string[] = [];

  for (const field of ANALYSIS_FIELDS) {
    const value = source[field.key];
    if (typeof value === "string" && value.trim()) {
      lines.push(`${field.label}: ${value.trim()}`);
    }
  }

  return lines.join("\n");
}


const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    palette: { type: Type.STRING },
    typography: { type: Type.STRING },
    composition: { type: Type.STRING },
    mood: { type: Type.STRING },
    suitedFor: { type: Type.STRING },
  },
};

/** 분석에 넘길 이미지 한 장. */
export interface StyleAnalysisImage {
  base64: string;
  mimeType: string;
}

/** 이미지를 읽어 디자인 특성 서술을 만든다. 테스트에서는 analyze 를 갈아 끼운다. */
export type StyleImageAnalyzer = (images: StyleAnalysisImage[]) => Promise<unknown>;

/**
 * 분석을 기다리는 한도.
 *
 * 이 서술은 **자동 추천에만** 쓰인다. 이미지 생성에는 원본 이미지가 그대로
 * 첨부되므로 서술이 없어도 아무 손해가 없다. 그런데 한도가 없으면 글 모델이
 * 응답하지 않을 때 화면이 몇 분씩 "분석하는 중"에 갇힌다 — 실제로 그랬다.
 * 곁다리 정보 때문에 본 작업을 막을 이유가 없다.
 */
const ANALYSIS_TIMEOUT_MS = 20_000;

export async function analyzeStyleImage(
  images: StyleAnalysisImage[],
  llm?: PdpLlm,
  analyze?: StyleImageAnalyzer,
): Promise<string> {
  const run = analyze ?? (llm ? analyzerFrom(llm) : null);
  // 글 모델이 없으면 서술 없이 간다. 곁다리 정보 때문에 본 작업을 막지 않는다.
  if (!run || !images.length) return "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      run(images),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[style] 이미지 분석 시간 초과 (${ANALYSIS_TIMEOUT_MS}ms) — 서술 없이 진행합니다`);
          resolve(null);
        }, ANALYSIS_TIMEOUT_MS);
      }),
    ]);
    return normalizeStyleAnalysis(raw);
  } catch (error) {
    console.warn("[style] 이미지 분석 실패", error);
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function analyzerFrom(llm: PdpLlm): StyleImageAnalyzer {
  return async (images) => {
    const response = await llm.generate({
      name: "style_analysis",
      description: "레퍼런스 이미지가 디자인 언어를 어떻게 쓰는지 읽는다.",
      prompt: buildStyleAnalysisPrompt(images.length),
      images,
      schema: ANALYSIS_SCHEMA,
    });

    try {
      return JSON.parse(response.text);
    } catch {
      return null;
    }
  };
}

/**
 * 섹션 생성 프롬프트에 덧붙일 지시.
 *
 * 사용자가 반영 강도를 "디자인 전체"로 골랐다. 색만 참고하라고 하면 그 선택을
 * 배신하는 것이다. 서술을 함께 싣는 이유는, 이미지만으로는 모델이 무엇을
 * 가져가야 할지 스스로 정하기 때문이다.
 */
export function describeStyleForPrompt(reference: { description?: string } | null) {
  if (!reference) return "";

  return [
    "Follow the supplied style reference image as the design language of this page.",
    "Match its colour palette, typography (weight, width, character), composition and use of space.",
    "Keep the scene and subject described above — only the design language comes from the reference.",
    "",
    "The reference reads as:",
    reference.description,
  ].join("\n");
}
