import {
  CARD_RATIOS,
  groupAttachments,
  layoutCards,
  modelById,
  selectReferencesForRole,
  unitPrice,
  type Attachment,
} from "@fixup/sns-core";

export interface CostEstimateInput {
  ratio: string;
  modelId: string;
  totalCards: number;
  attachments: Attachment[];
}

export interface CostEstimate {
  usd: number;
  generatedCount: number;
}

export function estimateCost(input: CostEstimateInput): CostEstimate {
  const model = modelById(input.modelId);
  const ratio = CARD_RATIOS.find((entry) => entry.id === input.ratio);
  if (!ratio) throw new Error(`지원하지 않는 카드 비율입니다: ${input.ratio}`);

  const grouped = groupAttachments(input.attachments);
  const layout = layoutCards({
    total: input.totalCards,
    placeAsIs: grouped.placeAsIs.map((attachment) => ({
      id: attachment.id,
      bodySlot: attachment.bodySlot,
    })),
    hasEndingImage: Boolean(grouped.ending),
  });
  if (layout.issues.length) return { usd: 0, generatedCount: 0 };

  let usd = 0;
  let generatedCount = 0;
  for (const card of layout) {
    if (card.kind === "place_as_is" || card.kind === "ending_image") continue;
    const mode = selectReferencesForRole(grouped, card.role).length ? "i2i" : "t2i";
    usd += unitPrice(model, mode, ratio.pixel);
    generatedCount += 1;
  }
  return { usd, generatedCount };
}
