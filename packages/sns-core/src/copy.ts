import { z } from "zod";
import type { CardPlan } from "./planning";
import { withIssueFallback } from "./provider-fallback";

export const PRIMARY_COPY_MODEL = "claude-sonnet-5";
export const BACKUP_COPY_PROVIDER = "openai";

export type CopyLanguage = "ko" | "en" | "ja" | "zh";

export interface CopyInput {
  sourceText: string;
  plans: CardPlan[];
  toneNote?: string;
  language: CopyLanguage;
}

export interface CardCopy {
  index: number;
  headline: string;
  body?: string;
  accent?: string;
  footnote?: string;
}

export interface CopyProvider {
  generate(prompt: string): Promise<unknown>;
}

export interface CopyResult {
  copies: CardCopy[];
  issues: string[];
}

const CopyResponseSchema = z.object({
  cards: z.array(z.object({
    index: z.number().int().positive(),
    headline: z.string().trim().min(1),
    body: z.string().optional(),
    accent: z.string().optional(),
    footnote: z.string().optional(),
  })).min(1),
});

const LANGUAGE_LABEL: Record<CopyLanguage, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "中文",
};

export function buildCopyPrompt(input: CopyInput): string {
  return [
    "확정된 카드 구조에 들어갈 카드뉴스 원고를 씁니다.",
    `출력 언어: ${LANGUAGE_LABEL[input.language]}. 자료가 다른 언어여도 원고는 이 언어로 쓰세요.`,
    "각 카드에는 headline(60자), body(200자), accent(30자), footnote(40자) 네 칸만 사용하세요.",
    input.toneNote ? `말투: ${input.toneNote}` : "",
    "자료에 없는 사실·수치·고유명사를 지어내지 마세요.",
    `카드 구조: ${JSON.stringify(input.plans)}`,
    `자료: ${input.sourceText}`,
  ].filter(Boolean).join("\n\n");
}

function cut(value: string | undefined, max: number): string | undefined {
  return value === undefined ? undefined : value.slice(0, max);
}

function normalizeCopy(input: CopyInput, raw: unknown): CardCopy[] {
  const parsed = CopyResponseSchema.parse(raw);
  return parsed.cards.slice(0, input.plans.length).map((card) => ({
    index: card.index,
    headline: card.headline.slice(0, 60),
    body: cut(card.body, 200),
    accent: cut(card.accent, 30),
    footnote: cut(card.footnote, 40),
  }));
}

async function generateValidCopy(
  input: CopyInput,
  prompt: string,
  provider: CopyProvider,
): Promise<CardCopy[]> {
  return normalizeCopy(input, await provider.generate(prompt));
}

export async function writeCopy(
  input: CopyInput,
  primary: CopyProvider,
  backup?: CopyProvider,
): Promise<CopyResult> {
  if (input.plans.length === 0) {
    return { copies: [], issues: ["원고를 쓸 카드 기획이 없습니다."] };
  }

  const prompt = buildCopyPrompt(input);
  const result = await withIssueFallback(
    () => generateValidCopy(input, prompt, primary),
    backup ? () => generateValidCopy(input, prompt, backup) : undefined,
    {
      primaryFailure: "주 모델 원고 실패",
      backupMissing: "OpenAI 예비 원고 제공자가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 원고도 실패했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 원고를 썼습니다",
    },
  );
  return { copies: result.value ?? [], issues: result.issues };
}
