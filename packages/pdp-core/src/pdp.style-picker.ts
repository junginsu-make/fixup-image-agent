import { GoogleGenAI, Type } from "@google/genai";
import type { StyleReferenceMatch } from "./pdp.style-reference";
import type { ProductBrief } from "./types";

/**
 * 스타일 레퍼런스 고르기 — 임베딩이 아니라 LLM 이 고른다.
 *
 * 처음에는 유사도 검색으로 골랐다. 실제로 재보니 쓸 수 없었다.
 *   전통 들기름 → 산뜻한 파스텔 (흙빛 수공예는 3위 안에도 없음)
 *   위스키      → 산뜻한 파스텔 (어두운 럭셔리는 0.329)
 *   개발자 도구 → 없음 (모던 테크가 0.293 으로 하한 미달)
 * "산뜻한 파스텔"이 모든 질의에서 1위였다. 점수가 0.29~0.44 에 몰려 순위가
 * 사실상 잡음이다.
 *
 * 원인은 분명하다. 질의는 **상품**(들기름·위스키) 얘기인데 레퍼런스 서술은
 * **디자인**(팔레트·서체) 얘기라 서로 다른 의미 공간에 있다. 정작 연결고리인
 * "어울리는 상품군"은 다섯 줄 중 한 줄이라 나머지에 묻힌다.
 *
 * 그래서 LLM 이 고른다. 레퍼런스가 수십 장 수준이면 서술 전부가 프롬프트
 * 하나에 들어가고, 이런 판단은 임베딩보다 LLM 이 훨씬 잘한다 — 프로젝트 G
 * 의 심사 루프에서 이미 확인했다.
 *
 * 규모가 커지면 임베딩으로 후보를 좁힌 뒤 LLM 이 고르게 한다.
 */

const PICK_MODEL = "gemini-3.1-pro-preview";

/**
 * LLM 에게 통째로 넘길 수 있는 레퍼런스 수.
 *
 * 서술 한 건이 약 300자다. 이 수까지는 프롬프트 하나에 다 들어간다.
 * 넘으면 임베딩으로 여기까지 좁힌 뒤 넘긴다 — 임베딩 순위는 못 믿지만,
 * 후보를 넉넉히 남기는 용도로는 쓸 만하다.
 */
export const LLM_PICK_THRESHOLD = 0.45;

export const MAX_PICK_CANDIDATES = 40;

export interface StylePick {
  referenceId: string;
  /** 0~1. 낮으면 쓰지 않는다. */
  confidence: number;
  reason: string;
}

const PICK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    referenceId: { type: Type.STRING },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING },
  },
};

export function buildStylePickPrompt(
  brief: ProductBrief,
  candidates: readonly StyleReferenceMatch[],
) {
  // 유사도는 보여주지 않는다. 잡음인 순위를 보여주면 모델이 거기에 끌려간다.
  const list = candidates
    .map((candidate) => `--- id: ${candidate.id} / 이름: ${candidate.name}\n${candidate.description}`)
    .join("\n\n");

  return `아래 상품의 상세페이지를 만든다. 어울리는 디자인 레퍼런스를 하나 고르라.

고른 레퍼런스는 이 페이지 **전체의 디자인 언어**가 된다. 색과 서체와 구성이
모두 그것을 따라간다. 그러니 상품의 성격·가격대·대상과 어긋나는 것을 고르면
페이지 전체가 망가진다.

**어울리는 것이 없으면 고르지 마라.** referenceId 를 빈 문자열로 두면 된다.
억지로 씌우느니 레퍼런스 없이 만드는 편이 낫다.

[상품]
이름: ${brief.offeringName}
한 줄 소개: ${brief.oneLiner}
대상: ${brief.audience}
가격 포지션: ${brief.pricePositioning}
원하는 인상: ${brief.tone}

[레퍼런스 후보]
${list}

[출력]
referenceId — 고른 것의 id. 없으면 빈 문자열
confidence — 0에서 1 사이. 이 선택을 얼마나 확신하는지
reason — 왜 그것을 골랐는지 한국어 한 문장`;
}

function asNumber(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeStylePick(raw: unknown): StylePick {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { referenceId: "", confidence: 0, reason: "" };
  }

  const source = raw as Record<string, unknown>;
  const id = typeof source.referenceId === "string" ? source.referenceId.trim() : "";

  return {
    // 모델이 "없음"을 문자열로 표현하는 경우가 있다.
    referenceId: id === "none" || id === "없음" ? "" : id,
    confidence: asNumber(source.confidence),
    reason: typeof source.reason === "string" ? source.reason.trim() : "",
  };
}

/** 고른 결과를 실제 레퍼런스로 바꾼다. 확신이 낮거나 없는 id 면 쓰지 않는다. */
export function resolvePickedReference(
  candidates: readonly StyleReferenceMatch[],
  pick: StylePick,
): StyleReferenceMatch | null {
  if (!pick.referenceId || pick.confidence < LLM_PICK_THRESHOLD) return null;
  return candidates.find((candidate) => candidate.id === pick.referenceId) ?? null;
}

export type StylePicker = (prompt: string) => Promise<unknown>;

/**
 * 후보 중 하나를 고른다. 실패하면 아무것도 고르지 않는다 —
 * 레퍼런스는 있으면 좋은 것이지, 없다고 생성을 막을 이유가 없다.
 */
export async function pickStyleWithLlm(
  brief: ProductBrief,
  candidates: readonly StyleReferenceMatch[],
  apiKey?: string,
  picker?: StylePicker,
): Promise<{ reference: StyleReferenceMatch | null; pick: StylePick }> {
  const empty = { referenceId: "", confidence: 0, reason: "" };
  if (candidates.length === 0) return { reference: null, pick: empty };

  const run = picker ?? createDefaultPicker(apiKey);
  try {
    const pick = normalizeStylePick(
      await run(buildStylePickPrompt(brief, candidates.slice(0, MAX_PICK_CANDIDATES))),
    );
    return { reference: resolvePickedReference(candidates, pick), pick };
  } catch (error) {
    console.warn("[style] 레퍼런스 선택 실패, 없이 진행합니다", error);
    return { reference: null, pick: empty };
  }
}

function createDefaultPicker(apiKey?: string): StylePicker {
  // 키 이름 우선순위는 저장소 전체가 같아야 한다 — GOOGLE_API_KEY 가 먼저다.
  const resolved = apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const client = new GoogleGenAI({ apiKey: resolved });

  return async (prompt) => {
    const response = await client.models.generateContent({
      model: PICK_MODEL,
      contents: [{ parts: [{ text: prompt }] }] as never,
      config: { responseMimeType: "application/json", responseSchema: PICK_SCHEMA as never },
    });
    try {
      return JSON.parse(response.text ?? "");
    } catch {
      return null;
    }
  };
}
