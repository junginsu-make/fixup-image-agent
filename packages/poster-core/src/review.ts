import { z } from "zod";
import { withIssueFallback } from "@fixup/shared";
import type { PosterSlots } from "./schemas";

/**
 * 포스터 검수.
 *
 * **고른 변형만 본다.** 세 장을 다 검수하면 두 장 값은 버리는 셈이다.
 *
 * **자동으로 다시 만들지 않는다.** 검수가 반려할 때마다 코드가 알아서 다시
 * 만들면 사용자 모르게 돈이 나간다. 사람이 보고 누른다.
 *
 * 두 방향을 다 본다 — 빠진 글자(`textFidelity`)와 **지어낸 글자**(`extraCopy`).
 * 한쪽만 보면 존재하지 않는 저작권 표시가 그대로 나간다.
 */

const FIELD_VERDICTS = ["exact", "missing", "changed", "not_applicable"] as const;

const PosterReviewSchema = z.object({
  decision: z.enum(["pass", "fail"]),
  summary: z.string().min(1),
  issues: z.array(z.string()),
  textFidelity: z.object({
    headline: z.enum(FIELD_VERDICTS),
    subline: z.enum(FIELD_VERDICTS),
    sideTexts: z.enum(FIELD_VERDICTS),
  }),
  extraCopy: z.object({
    status: z.enum(["none", "present", "uncertain"]),
    texts: z.array(z.string()),
  }),
});

export type PosterReview = z.infer<typeof PosterReviewSchema>;

export interface PosterReviewProviderInput {
  prompt: string;
  imageUrl: string;
  preservedImageUrls: string[];
}

export interface PosterReviewProvider {
  review(input: PosterReviewProviderInput): Promise<unknown>;
}

export interface PosterReviewInput {
  slots: PosterSlots;
  imageUrl: string;
  preservedImageUrls: string[];
}

export interface PosterReviewResult {
  status: "done" | "review_required";
  review?: PosterReview;
  issues: string[];
  requiresHumanAction: boolean;
  autoRegenerated: false;
}

/** 안 고른 변형은 보지 않는다. */
export function shouldReviewPoster(image: { selected: boolean }): boolean {
  return image.selected;
}

export function buildReviewPrompt(slots: PosterSlots): string {
  const expected = [
    ["headline", slots.headline],
    ["subline", slots.subline],
    ["sideTexts", slots.sideTexts.join(" | ")],
  ].filter(([, value]) => value!.trim().length > 0);

  return [
    "완성된 포스터를 보고 판정하세요. 프롬프트가 아니라 **이미지에 실제로 보이는 것**을 봅니다.",
    "",
    "확정 원고:",
    ...(expected.length
      ? expected.map(([label, value]) => `  ${label}: ${value}`)
      : ["  (없음)"]),
    "",
    "textFidelity: 위 원고가 이미지에 그대로 들어갔는지 칸마다 판정하세요.",
    "  exact / missing / changed / not_applicable (원고가 비어 있을 때)",
    "  철자·띄어쓰기·누락·중복·임의 변경을 봅니다.",
    "",
    "extraCopy: 반대 방향도 봅니다. 원고에 없는 인사말·슬로건·CTA·푸터 문구·",
    "  저작권 표시·상표 주장·날짜·브랜드명이 카드 카피처럼 추가됐으면 present.",
    "  장면 세계 안의 간판·표지판·소품 라벨은 카피나 사실 주장으로 쓰이지",
    "  않는 한 extraCopy 가 아닙니다.",
    "  카피인지 배경 소품인지 확신할 수 없으면 uncertain 으로 두고 보이는",
    "  문자열을 texts 에 적으세요.",
    "",
    "보존 대상 이미지가 함께 있으면 원본과 형태·색·비율·라벨을 대조하세요.",
    "판정은 pass 또는 fail 로 하고, 사람이 이해할 summary 와 구체적인 issues 를 주세요.",
  ].join("\n");
}

function enforce(input: PosterReviewInput, review: PosterReview): PosterReview {
  const expected: Array<[keyof PosterReview["textFidelity"], string]> = [
    ["headline", input.slots.headline],
    ["subline", input.slots.subline],
    ["sideTexts", input.slots.sideTexts.join("")],
  ];
  const missing = expected
    .filter(([field, value]) => value.trim().length > 0 && review.textFidelity[field] !== "exact")
    .map(([field]) => `${field} 원고가 이미지에 정확히 들어가지 않았습니다 (${review.textFidelity[field]}).`);

  const extra = review.extraCopy.status === "none" ? [] : [
    review.extraCopy.status === "present"
      ? `원고에 없는 글자가 들어갔습니다: ${review.extraCopy.texts.join(" / ")}`
      : `카피인지 배경 글자인지 확인이 필요합니다: ${review.extraCopy.texts.join(" / ")}`,
  ];

  if (!missing.length && !extra.length) return review;
  // 원고 대조는 판단이 아니라 확인이다. 모델 재량에 맡기지 않는다.
  return { ...review, decision: "fail", issues: [...review.issues, ...missing, ...extra] };
}

export async function reviewPoster(
  input: PosterReviewInput,
  primary: PosterReviewProvider,
  backup?: PosterReviewProvider,
): Promise<PosterReviewResult> {
  const call = async (provider: PosterReviewProvider) => enforce(input, PosterReviewSchema.parse(
    await provider.review({
      prompt: buildReviewPrompt(input.slots),
      imageUrl: input.imageUrl,
      preservedImageUrls: input.preservedImageUrls,
    }),
  ));

  const { value, issues } = await withIssueFallback(
    () => call(primary),
    backup ? () => call(backup) : undefined,
    {
      primaryFailure: "주 검수 실패",
      backupMissing: "OpenAI 예비 검수가 설정되지 않았습니다.",
      backupFailure: "OpenAI 예비 검수도 실패했습니다",
      backupSuccess: "주 검수가 실패해 OpenAI 예비로 검수했습니다",
    },
  );

  // 검수를 못 했다고 통과시키지도, 버리지도 않는다. 이미 돈을 낸 이미지다.
  const passed = value?.decision === "pass";
  return {
    status: passed ? "done" : "review_required",
    review: value,
    issues: [...issues, ...(value && !passed ? value.issues : [])],
    requiresHumanAction: !passed,
    autoRegenerated: false,
  };
}
