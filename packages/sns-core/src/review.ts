import { z } from "zod";
import type { CardSlotKind } from "./card-count";
import type { CardCopy } from "./copy";
import { withIssueFallback } from "./provider-fallback";

export interface ReviewPromptInput {
  copy: Pick<CardCopy, "headline" | "body" | "accent" | "footnote">;
  hasPreserved: boolean;
}

export function buildReviewPrompt(input: ReviewPromptInput): string {
  return [
    "완성된 카드뉴스 이미지를 검수합니다. 프롬프트가 아니라 이미지에 실제로 보이는 결과만 판단하세요.",
    `기대 원고: ${JSON.stringify(input.copy)}`,
    "기대 원고의 철자·띄어쓰기·누락·중복·임의 변경과 실제 읽기 어려움이 있는지 설명하세요.",
    input.hasPreserved
      ? "보존 대상 원본과 실제 이미지를 대조해 정체성·형태·색·비율·라벨이 유지됐는지 설명하세요."
      : "",
    "판정은 pass 또는 fail로 하고, 사람이 이해할 summary와 구체적인 issues를 돌려주세요.",
    "숫자 등급이나 수치 문턱을 만들지 마세요.",
  ].filter(Boolean).join("\n\n");
}

export function shouldReview(card: {
  kind: CardSlotKind;
  reviewRequired?: boolean;
}): boolean {
  if (card.reviewRequired === false) return false;
  return card.kind === "generated";
}

export interface CardReview {
  decision: "pass" | "fail";
  summary: string;
  issues: string[];
}

export interface ReviewProviderInput {
  prompt: string;
  imageUrl: string;
  preservedImageUrls: string[];
}

export interface ReviewRequest {
  review(input: ReviewProviderInput): Promise<unknown>;
}

export interface ReviewCardInput {
  kind: CardSlotKind;
  imageUrl: string;
  copy: Pick<CardCopy, "headline" | "body" | "accent" | "footnote">;
  preservedImageUrls: string[];
  reviewRequired?: boolean;
}

export interface ReviewCardResult {
  status: "done" | "review_required" | "skipped";
  review?: CardReview;
  issues: string[];
  requiresHumanAction: boolean;
  autoRegenerated: false;
}

const CardReviewSchema = z.object({
  decision: z.enum(["pass", "fail"]),
  summary: z.string().min(1),
  issues: z.array(z.string()),
});

async function callReview(
  input: ReviewCardInput,
  provider: ReviewRequest,
): Promise<CardReview> {
  return CardReviewSchema.parse(await provider.review({
    prompt: buildReviewPrompt({ copy: input.copy, hasPreserved: input.preservedImageUrls.length > 0 }),
    imageUrl: input.imageUrl,
    preservedImageUrls: input.preservedImageUrls,
  }));
}

/**
 * 검수는 판정만 남긴다. fail이어도 이미지를 보존하고 사람이 누를 때까지 기다린다.
 * 자동 재생성 함수나 재시도 횟수를 입력으로 받지 않는다.
 */
export async function reviewCard(
  input: ReviewCardInput,
  primary: ReviewRequest,
  backup?: ReviewRequest,
): Promise<ReviewCardResult> {
  if (!shouldReview(input)) {
    return {
      status: "skipped",
      review: undefined,
      issues: [],
      requiresHumanAction: false,
      autoRegenerated: false,
    };
  }

  const result = await withIssueFallback(
    () => callReview(input, primary),
    backup ? () => callReview(input, backup) : undefined,
    {
      primaryFailure: "주 검수 실패",
      backupMissing: "OpenAI 예비 검수가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 검수도 실패했습니다",
      backupSuccess: "주 검수가 실패해 OpenAI 예비로 검수했습니다",
    },
  );

  if (!result.value) {
    return {
      status: "review_required",
      review: undefined,
      issues: result.issues,
      requiresHumanAction: true,
      autoRegenerated: false,
    };
  }

  const requiresHumanAction = result.value.decision === "fail";
  return {
    status: requiresHumanAction ? "review_required" : "done",
    review: result.value,
    issues: result.issues,
    requiresHumanAction,
    autoRegenerated: false,
  };
}
