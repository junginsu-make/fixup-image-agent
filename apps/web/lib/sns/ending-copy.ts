import { LANGUAGE_LABEL, type CopyLanguage } from "@fixup/sns-core";
import type { SnsFlowCard } from "../../app/api/sns/flow-service";
import { errorLogText } from "../easy/log-text";

/**
 * **카드뉴스 마지막 장 원고를 앞 장들로 쓴다**(2026-10-07 Task 5 (a)).
 *
 * 기획은 마지막 장을 계획하지 않는다(`sns-core/planning.ts` 「마지막 장은 따로 처리」). 그래서
 * 일반 화면은 고정 문구 · 빈 본문 · 고정 그림 방향으로 나갔다(운영 4/4). 「쉽게」가 메우던 방식
 * (`app/easy/cardnews-ending.ts`)과 같게 앞 장들을 정리해 쓰고, 그림 방향(`intent` · `visualBrief`)도
 * 내용에서 받는다. **못 쓰면 `undefined`** 다 — 부르는 쪽이 지금 고정 문구를 그대로 둔다.
 */

export interface EndingProvider {
  generate(prompt: string): Promise<unknown>;
}

export interface EndingCopy {
  headline: string;
  body: string;
  intent: string;
  visualBrief: string;
}

/** 이 안에 못 쓰면 기다리지 않는다. 기획 라우트는 5분이 상한이고 원고 단계가 이미 그 대부분을 쓴다. */
export const ENDING_DEADLINE_MS = 60_000;

const 제목상한 = 40;
const 본문상한 = 220;
const 방향상한 = 300;

/** AI 가 쓴 표지 · 속지만. 원본 그대로 장 · 마지막 장은 정리 거리가 아니다(「쉽게」와 같다). */
const 앞장들 = (cards: readonly SnsFlowCard[]) =>
  cards.filter((card) => card.kind === "generated" && (card.role === "cover" || card.role === "body"));

export function endingCopyPrompt(input: {
  cards: readonly SnsFlowCard[];
  language: string;
  toneNote?: string;
}): string {
  const 언어 = LANGUAGE_LABEL[input.language as CopyLanguage] ?? LANGUAGE_LABEL.ko;
  const 앞장 = 앞장들(input.cards).map((card) => [
    `${card.index}. ${card.copy.headline}${card.copy.body ? ` / ${card.copy.body}` : ""}`,
    card.plan?.visualBrief ? `   그림: ${card.plan.visualBrief}` : "",
  ].filter(Boolean).join("\n"));
  return [
    "카드뉴스의 **마지막 장** 원고와 그림 방향을 씁니다. 앞 장들의 핵심을 한눈에 다시 보게 하는 정리 장입니다.",
    "",
    "앞 장:",
    ...앞장,
    "",
    "규칙:",
    "- headline: 정리 장 제목. 짧게(20자 안팎). 앞 장 제목을 그대로 되풀이하지 않습니다.",
    "- body: 핵심 3~4줄. 줄마다 「· 」로 시작하고 줄바꿈으로 나눕니다. 한 줄은 25자 안팎.",
    "- intent: 이 장이 독자에게 남길 것 한 문장(한국어).",
    "- visualBrief: 이 장에 어울리는 그림 방향 한두 문장(한국어). 앞 장 그림과 한 시리즈로 보이게, 이 장의 내용에 맞게.",
    "- 앞 장에 없는 사실 · 숫자 · 기관 이름을 새로 넣지 않습니다.",
    `- headline 과 body 는 ${언어}로 씁니다.`,
    ...(input.toneNote ? [`- 말투: ${input.toneNote}`] : []),
  ].join("\n");
}

const 글 = (value: unknown, limit: number): string => (typeof value === "string" ? value.trim().slice(0, limit) : "");

export function readEndingCopy(raw: unknown): EndingCopy | undefined {
  const value = (raw ?? {}) as Record<string, unknown>;
  const copy = {
    headline: 글(value.headline, 제목상한),
    body: 글(value.body, 본문상한),
    intent: 글(value.intent, 방향상한),
    visualBrief: 글(value.visualBrief, 방향상한),
  };
  return Object.values(copy).every(Boolean) ? copy : undefined;
}

async function attempt(provider: EndingProvider | undefined, prompt: string): Promise<EndingCopy | undefined> {
  if (!provider) return undefined;
  try {
    return readEndingCopy(await provider.generate(prompt));
  } catch (error) {
    // 제공자 원문은 가린 제공자(`maskedStructured`)가 이미 서버 기록에 남겼다.
    console.warn("[sns] 마지막 장 원고 쓰기 실패", errorLogText(error));
    return undefined;
  }
}

/** 주 모델 → 예비. 둘 다 못 쓰거나 제한 시간을 넘기면 `undefined`. 던지지 않는다. */
export async function writeEndingCopy(
  input: Parameters<typeof endingCopyPrompt>[0],
  primary?: EndingProvider,
  backup?: EndingProvider,
  deadlineMs: number = ENDING_DEADLINE_MS,
): Promise<EndingCopy | undefined> {
  if (!primary && !backup) return undefined;
  const prompt = endingCopyPrompt(input);
  const work = (async () => (await attempt(primary, prompt)) ?? attempt(backup, prompt))();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), deadlineMs); });
  try {
    const written = await Promise.race([work, deadline]);
    if (!written) console.warn("[sns] 마지막 장 원고를 쓰지 못해 기본 문구로 둡니다");
    return written;
  } finally {
    clearTimeout(timer);
  }
}
