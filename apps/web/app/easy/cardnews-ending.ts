import { CARD_LANGUAGE_LABEL, CARD_LANGUAGES } from "./cardnews-options";

/**
 * **마지막 장 원고를 채운다**(2026-09-30 사용자 결정 B — 「기존 코드를 건들지 말고
 * 쉽게 안에서만 고치세요」).
 *
 * 기존 카드뉴스 흐름은 마지막 장에 「핵심 내용을 기억해 주세요」 한 줄만 넣는다
 * (`lib/sns/actual-flow.ts:92-100`). 카드뉴스 화면은 만들기 전에 사람이 고치지만
 * 「쉽게」에는 그 단계가 없어, 실제로 만들어 보니 마지막 장이 비어 나왔다. 그래서
 * 원고를 쓴 직후 앞 장들을 정리해 채운다. 저장은 카드뉴스 화면이 쓰는 원고 고치기
 * 라우트를 그대로 부른다(`lib/easy/cardnews-steps.ts`).
 */

interface EndingCard {
  index: number;
  role: string;
  kind?: string;
  copy: { headline: string; body?: string };
}

export interface EndingProject {
  language: string;
  data: { flow?: { cards: EndingCard[] } };
}

export interface EndingCopy {
  headline: string;
  body: string;
}

const 제목상한 = 40;
const 본문상한 = 220;
const 줄상한 = 5;

const 정리제목: Record<(typeof CARD_LANGUAGES)[number], string> = {
  ko: "오늘의 핵심 정리", en: "Key takeaways", ja: "今日のポイント", zh: "今日要点",
};

const 카드들 = (project: EndingProject) => project.data.flow?.cards ?? [];

/** AI 가 쓴 속지만. 표지 · 원본 그대로 장 · 마지막 장은 정리 거리가 아니다. */
const 속지들 = (project: EndingProject) =>
  카드들(project).filter((card) => card.role === "body" && (card.kind ?? "generated") === "generated");

/** 채울 마지막 장 번호. AI 가 그리는 끝 장인데 본문이 비었을 때만. */
export function endingToFill(project: EndingProject): number | undefined {
  const ending = 카드들(project).find((card) => card.role === "ending");
  if (!ending || (ending.kind ?? "generated") !== "generated" || ending.copy.body?.trim()) return undefined;
  return ending.index;
}

export function endingPrompt(project: EndingProject): string {
  const 언어 = CARD_LANGUAGE_LABEL[project.language as (typeof CARD_LANGUAGES)[number]] ?? "한국어";
  const 앞장 = 카드들(project)
    .filter((card) => card.role === "cover" || 속지들(project).includes(card))
    .map((card) => `${card.index}. ${card.copy.headline}${card.copy.body ? ` / ${card.copy.body}` : ""}`);
  return [
    "카드뉴스의 **마지막 장** 원고를 씁니다. 앞 장들의 핵심을 한눈에 다시 보게 하는 정리 장입니다.",
    "",
    "앞 장:",
    ...앞장,
    "",
    "규칙:",
    "- headline: 정리 장 제목. 짧게(20자 안팎). 앞 장 제목을 그대로 되풀이하지 않습니다.",
    "- body: 핵심 3~4줄. 줄마다 「· 」로 시작하고 줄바꿈으로 나눕니다. 한 줄은 25자 안팎.",
    "- 앞 장에 없는 사실 · 숫자 · 기관 이름을 새로 넣지 않습니다.",
    `- ${언어}로 씁니다.`,
  ].join("\n");
}

export function readEnding(raw: unknown): EndingCopy | undefined {
  const value = (raw ?? {}) as { headline?: unknown; body?: unknown };
  const headline = typeof value.headline === "string" ? value.headline.trim() : "";
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (!headline || !body) return undefined;
  return { headline: headline.slice(0, 제목상한), body: body.slice(0, 본문상한) };
}

/** AI 가 못 쓰면 앞 장 제목으로 목록을 만든다. 빈 끝 장은 어떤 경우에도 안 나간다. */
export function fallbackEnding(project: EndingProject): EndingCopy {
  const 언어 = project.language as (typeof CARD_LANGUAGES)[number];
  return {
    headline: 정리제목[언어] ?? 정리제목.ko,
    body: 속지들(project).slice(0, 줄상한).map((card) => `· ${card.copy.headline}`).join("\n"),
  };
}
