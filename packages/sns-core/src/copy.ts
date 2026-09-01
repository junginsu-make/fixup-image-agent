import { z } from "zod";
import type { CardPlan } from "./planning";
import { withIssueFallback } from "@fixup/shared";

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
    headline: z.string().min(1),
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
    "각 카드에는 headline, body, accent, footnote 네 칸만 사용하세요.",
    "카드 하나가 읽기 벅차지 않게 쓰세요.",
    "제목은 한눈에 들어오는 길이로, 본문은 요점만.",
    "내용이 꼭 필요해서 길어지면 줄이지 마세요 — 그림 단계에서 글자를 작게 넣어 소화합니다.",
    input.toneNote ? `말투: ${input.toneNote}` : "",
    "자료에 없는 사실·수치·고유명사를 지어내지 마세요.",
    `카드 구조: ${JSON.stringify(input.plans)}`,
    `자료: ${input.sourceText}`,
  ].filter(Boolean).join("\n\n");
}

function normalizeCopy(raw: unknown): CardCopy[] {
  const parsed = CopyResponseSchema.parse(raw);
  return parsed.cards;
}

async function generateValidCopy(
  prompt: string,
  provider: CopyProvider,
): Promise<CardCopy[]> {
  return normalizeCopy(await provider.generate(prompt));
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
    () => generateValidCopy(prompt, primary),
    backup ? () => generateValidCopy(prompt, backup) : undefined,
    {
      primaryFailure: "주 모델 원고 실패",
      backupMissing: "OpenAI 예비 원고 제공자가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 원고도 실패했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 원고를 썼습니다",
    },
  );
  return { copies: result.value ?? [], issues: result.issues };
}
