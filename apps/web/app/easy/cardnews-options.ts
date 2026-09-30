import { IMAGE_LOOKS, creditUnits, llmCostUsd, type ImageLook } from "@fixup/shared";
import { IMAGE_MODELS, type Attachment } from "@fixup/sns-core";
import { estimateCost } from "../sns/cost-estimate";

/**
 * **카드뉴스 조건**(2단계 설계 §7). 원고 밑 조건 줄이 바꾸는 값이다.
 *
 * 말에 있던 것, 고른 것, 기본값 차례로 정한다. 허용 값은 카드뉴스 만들기 입력
 * (`app/api/sns/projects/schema.ts`)과 같다. 여기서 넓히면 만들기가 400 으로 막힌다.
 */

export const CARD_RATIOS = ["4:5", "1:1", "9:16", "16:9"] as const;
export const CARD_COUNTS = [4, 5, 6, 7, 8] as const;
export const CARD_LANGUAGES = ["ko", "en", "ja", "zh"] as const;
export const CARD_LANGUAGE_LABEL: Record<(typeof CARD_LANGUAGES)[number], string> = {
  ko: "한국어", en: "영어", ja: "일본어", zh: "중국어",
};
export const DEFAULT_CARD_MODEL = "gpt-image-2.5-flare";

export interface CardOptions {
  ratio: (typeof CARD_RATIOS)[number];
  count: "auto" | (typeof CARD_COUNTS)[number];
  language: (typeof CARD_LANGUAGES)[number];
  modelId: string;
  look: ImageLook;
}

const 모델들 = new Set(IMAGE_MODELS.map((model) => model.id));
const 비율 = (value: unknown) => (CARD_RATIOS as readonly unknown[]).includes(value);
const 결 = (value: unknown) => (IMAGE_LOOKS as readonly unknown[]).includes(value);

/** 화면이 보낸 조건. 아는 값만 받는다. */
export function readCardOptions(raw: unknown): Partial<CardOptions> {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    ...(비율(value.ratio) ? { ratio: value.ratio as CardOptions["ratio"] } : {}),
    ...(value.count === "auto" || (CARD_COUNTS as readonly unknown[]).includes(value.count)
      ? { count: value.count as CardOptions["count"] } : {}),
    ...((CARD_LANGUAGES as readonly unknown[]).includes(value.language)
      ? { language: value.language as CardOptions["language"] } : {}),
    ...(typeof value.modelId === "string" && 모델들.has(value.modelId) ? { modelId: value.modelId } : {}),
    ...(결(value.look) ? { look: value.look as ImageLook } : {}),
  };
}

export function cardOptionsFrom(input: {
  said: { ratio?: string; look?: string };
  chosen: Partial<CardOptions>;
  imageModel?: string;
}): CardOptions {
  return {
    ratio: input.chosen.ratio ?? (비율(input.said.ratio) ? input.said.ratio as CardOptions["ratio"] : "4:5"),
    count: input.chosen.count ?? "auto",
    language: input.chosen.language ?? "ko",
    modelId: input.chosen.modelId
      ?? (input.imageModel && 모델들.has(input.imageModel) ? input.imageModel : DEFAULT_CARD_MODEL),
    look: input.chosen.look ?? (결(input.said.look) ? input.said.look as ImageLook : "auto"),
  };
}

export function projectSpecFrom(options: CardOptions) {
  return {
    ratio: options.ratio,
    cardCountMode: options.count === "auto" ? "auto" as const : "fixed" as const,
    ...(options.count === "auto" ? {} : { cardCount: options.count }),
    language: options.language,
    modelId: options.modelId,
    look: options.look,
  };
}

/** 저장된 작업에서 조건을 되읽는다. */
export function optionsOfProject(project: {
  ratio: string; language: string; modelId: string; cardCountMode: string; cardCount?: number | null;
  data: { look?: string };
}): CardOptions {
  return cardOptionsFrom({
    said: {},
    chosen: readCardOptions({
      ratio: project.ratio,
      language: project.language,
      modelId: project.modelId,
      look: project.data.look ?? "auto",
      count: project.cardCountMode === "fixed" ? project.cardCount : "auto",
    }),
  });
}

/**
 * **「이대로 만들기」에 적을 값.** 카드뉴스 `generate` 가 예약하는 값과 같아야 한다.
 *
 * - image-v2: 원고 카드 수(원본 그대로 · 마지막 장 포함, `creditImagePlan(cards.length)`)
 * - cost-v1: `creditUnits(estimate.usd + llmCostUsd({ planCalls: 1 + generatedCount }))`
 */
export function cardCost(input: {
  policy: "cost-v1" | "image-v2";
  ratio: string;
  modelId: string;
  attachments: Attachment[];
  cards: ReadonlyArray<{ index: number; kind?: string; layout?: unknown }>;
}): { units: number; label: string } {
  if (input.policy === "image-v2") return { units: input.cards.length, label: `약 ${input.cards.length}크레딧` };
  const estimate = estimateCost({
    ratio: input.ratio,
    modelId: input.modelId,
    totalCards: input.cards.length,
    attachments: input.attachments,
    cards: input.cards as never,
  });
  const units = creditUnits(estimate.usd + llmCostUsd({ planCalls: 1 + estimate.generatedCount }));
  return { units, label: `약 ${units}장` };
}
