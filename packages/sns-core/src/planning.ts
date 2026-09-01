import { z } from "zod";
import type { SlotPlan } from "./card-count";
import { withIssueFallback } from "@fixup/shared";

export const PRIMARY_PLANNING_MODEL = "claude-sonnet-5";
export const BACKUP_PLANNING_PROVIDER = "openai";

export interface PlanInput {
  sourceText: string;
  slots: SlotPlan;
  toneNote?: string;
  language: string;
}

export interface CardPlan {
  index: number;
  role: "cover" | "body";
  intent: string;
  visualBrief: string;
}

export interface PlanProvider {
  generate(prompt: string): Promise<unknown>;
}

export interface PlanResult {
  cards: CardPlan[];
  issues: string[];
}

const CardPlanSchema = z.object({
  index: z.number().int().positive(),
  role: z.enum(["cover", "body"]),
  intent: z.string().trim().min(1),
  visualBrief: z.string().trim().min(1),
});

const PlanResponseSchema = z.object({
  total: z.number().int().optional(),
  cards: z.array(CardPlanSchema).min(1),
});

export function buildPlanPrompt(input: PlanInput): string {
  const fixedSlots = input.slots.total === "auto"
    ? ""
    : `채울 자리는 표지 1자리와 속지 ${input.slots.aiBody}자리입니다. 정확히 ${input.slots.cover + input.slots.aiBody}장을 계획하세요.`;
  const autoSlots = input.slots.total === "auto" && input.slots.autoRange
    ? [
      `Task 4가 허용한 전체 장수는 ${input.slots.autoRange.min}~${input.slots.autoRange.max}장입니다. 이 범위 안에서 전체 장수를 한 번에 고르세요.`,
      `사용자 원본 ${input.slots.placeAsIs}장과 마지막 ${input.slots.ending}장은 이미 자리를 차지합니다. 응답의 cards에는 나머지 표지·AI 속지만 넣고, 고른 전체 장수를 total에 적으세요.`,
      "장수만 먼저 답하지 말고 total과 cards를 한 응답으로 제출하세요.",
    ].join("\n")
    : "";

  return [
    "한국어 인스타그램 카드뉴스의 구조를 짭니다.",
    fixedSlots,
    autoSlots,
    input.slots.placeAsIs > 0
      ? `이 밖에 사용자가 올린 원본 ${input.slots.placeAsIs}장이 속지 자리를 이미 차지합니다. 그것은 계획하지 마세요.`
      : "",
    "마지막 장은 따로 처리하므로 계획하지 마세요.",
    input.toneNote ? `말투: ${input.toneNote}` : "",
    "각 카드마다 무엇을 말할지(intent)와 어떤 그림이 어울릴지(visualBrief)를 적으세요.",
    "자료에 없는 사실·수치·고유명사를 지어내지 마세요.",
    `자료: ${input.sourceText}`,
  ].filter(Boolean).join("\n\n");
}

function normalizeResponse(input: PlanInput, raw: unknown): CardPlan[] {
  const parsed = PlanResponseSchema.parse(raw);
  if (input.slots.total !== "auto") {
    return parsed.cards.slice(0, input.slots.cover + input.slots.aiBody);
  }

  const range = input.slots.autoRange;
  if (!range) throw new Error("AI 추천 장수 범위가 없습니다.");
  const reserved = input.slots.placeAsIs + input.slots.ending;
  const inferredTotal = parsed.cards.length + reserved;
  const selectedTotal = parsed.total ?? inferredTotal;
  if (selectedTotal < range.min || selectedTotal > range.max) {
    throw new Error(`AI가 허용 범위 ${range.min}~${range.max}장을 벗어난 ${selectedTotal}장을 골랐습니다.`);
  }
  if (selectedTotal !== inferredTotal) {
    throw new Error(`AI가 고른 ${selectedTotal}장과 실제 자리 합계 ${inferredTotal}장이 다릅니다.`);
  }
  return parsed.cards;
}

async function generateValidPlan(
  input: PlanInput,
  prompt: string,
  provider: PlanProvider,
): Promise<CardPlan[]> {
  return normalizeResponse(input, await provider.generate(prompt));
}

export async function planCards(
  input: PlanInput,
  primary: PlanProvider,
  backup?: PlanProvider,
): Promise<PlanResult> {
  if (input.slots.issues.length > 0) {
    return {
      cards: [],
      issues: input.slots.issues.map((issue) => `Task 4 자리 계산 오류: ${issue}`),
    };
  }
  if (input.slots.total === "auto" && !input.slots.autoRange) {
    return { cards: [], issues: ["AI 추천 장수 범위가 없습니다."] };
  }

  const prompt = buildPlanPrompt(input);
  const result = await withIssueFallback(
    () => generateValidPlan(input, prompt, primary),
    backup ? () => generateValidPlan(input, prompt, backup) : undefined,
    {
      primaryFailure: "주 모델 기획 실패",
      backupMissing: "OpenAI 예비 제공자가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 기획도 실패했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 만들었습니다",
    },
  );
  return { cards: result.value ?? [], issues: result.issues };
}
