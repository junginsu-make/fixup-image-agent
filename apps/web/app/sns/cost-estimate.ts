import {
  CARD_RATIOS,
  groupAttachments,
  layoutCards,
  modelById,
  selectReferencesForRole,
  unitPrice,
  type Attachment,
} from "@fixup/sns-core";
import { estimateSlots, estimateTotalUsd, type LayoutSlot } from "@fixup/layout-core";

export interface CostEstimateInput {
  ratio: string;
  modelId: string;
  totalCards: number;
  attachments: Attachment[];
  /**
   * 이미 틀이 붙은 카드들. 만들기 직전에만 알 수 있다.
   *
   * **틀이 있으면 그림 칸 하나가 요청 하나다.** 칸이 셋이면 fal 에 세 번 간다.
   * 이걸 안 보고 카드당 한 번으로 세면 예약이 실제 지출의 1/N 이 되고,
   * `finalize_generation` 이 예약액을 상한으로 깎기 때문에 넘치는 만큼은
   * 확정에서 제대로 세어도 그대로 증발한다.
   *
   * 첫 화면의 「예상 비용」은 아직 틀을 모르므로 이 값 없이 부른다 —
   * 그때는 지금까지처럼 카드당 한 번으로 센다.
   */
  cards?: Array<{ index: number; layout?: { slots: LayoutSlot[] } | null }>;
  /**
   * 이 번호의 카드만 센다. 비우면 전부 센다.
   *
   * 카드 한 장 「다시 만들기」가 쓴다 — 그 한 장 값만 예약해야 나머지 장수가
   * 괜히 한도에 묶이지 않는다.
   */
  onlyCardIndexes?: number[];
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

  const layoutByIndex = new Map(
    (input.cards ?? []).map((card) => [card.index, card.layout?.slots ?? []]),
  );
  const only = input.onlyCardIndexes ? new Set(input.onlyCardIndexes) : undefined;

  let usd = 0;
  let generatedCount = 0;
  for (const card of layout) {
    if (card.kind === "place_as_is" || card.kind === "ending_image") continue;
    if (only && !only.has(card.index)) continue;
    const mode = selectReferencesForRole(grouped, card.role).length ? "i2i" : "t2i";
    // 틀의 그림 칸마다 따로 시킨다. 칸은 카드보다 작아 값도 칸 크기로 센다.
    const slots = estimateSlots(layoutByIndex.get(card.index) ?? [], ratio.pixel, input.modelId);
    if (slots.length) {
      usd += estimateTotalUsd(slots);
      generatedCount += slots.length;
      continue;
    }
    usd += unitPrice(model, mode, ratio.pixel);
    generatedCount += 1;
  }
  return { usd, generatedCount };
}
