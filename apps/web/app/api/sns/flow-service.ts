import type { LayoutSlot } from "@fixup/layout-core";
import type { Caption, CardCopy, CardPlan, CardReview } from "@fixup/sns-core";

export interface SnsFlowCard {
  index: number;
  kind: "generated" | "place_as_is" | "ending_image";
  role: "cover" | "body" | "ending";
  copy: CardCopy;
  plan?: CardPlan;
  attachmentId?: string;
  assetPath?: string;
  /**
   * 결과판·목록에 거는 미리보기.
   *
   * **없으면 화면이 원본으로 떨어진다.** 이미 만든 카드에는 없고, 자리는
   * 적혀 있는데 파일만 사라질 수도 있다.
   */
  thumbPath?: string | null;
  thumbUrl?: string;
  prompt?: string;
  promptWarnings?: string[];
  falRequestId?: string;
  generationRequestId?: string;
  generationEndpoint?: string;
  generationStartedAt?: string;
  status: "pending" | "generating" | "review_required" | "done" | "failed";
  /**
   * 레이아웃 고정으로 만들 때만 있다. **없으면 지금까지대로 통째로 그린다.**
   *
   * 뼈대를 참조(id)로 두지 않고 칸을 복사해 박아 둔다 — 참조만 두면 나중에
   * 그 뼈대를 고쳤을 때 지난 작업이 소리 없이 달라진다.
   */
  layout?: { templateId: string; slots: LayoutSlot[] };
  /**
   * 레이아웃 카드의 그림 칸마다 하나씩. **칸 하나가 fal 요청 하나다.**
   *
   * 레퍼런스에 그림 자리가 셋이면 셋 다 채워야 「그대로」가 된다. 칸마다
   * 주문서가 다르므로(「수리 전」과 「수리 후」) 한 번에 시킬 수 없다.
   *
   * 다 올 때까지 합성하지 않는다. 한 칸이 실패해도 나머지로 카드는 만든다.
   */
  slotJobs?: SnsFlowSlotJob[];
  assetUrl?: string;
  review?: CardReview;
  reviewIssues?: string[];
  error?: string;
}

export interface SnsFlowSlotJob {
  /** `layout.slots` 안의 자리. 합성할 때 이 번호로 그림을 꽂는다. */
  slot: number;
  prompt: string;
  status: "pending" | "generating" | "done" | "failed";
  falRequestId?: string;
  generationRequestId?: string;
  endpoint?: string;
  startedAt?: string;
  /** 받아 둔 그림. 다른 칸이 올 때까지 들고 있는다. */
  imageUrl?: string;
  error?: string;
}

export interface SnsFlowCost {
  cardIndex: number;
  costUsd: number | null;
  unitCostUsd?: number;
  falRequestId?: string;
  generationRequestId?: string;
}

export interface SnsFlowState {
  stage: "copy" | "result";
  planningIssues: string[];
  copyIssues: string[];
  cards: SnsFlowCard[];
  costs: SnsFlowCost[];
  /** 인스타그램에 붙일 게시글 문구. 카드가 다 나온 뒤 사용자가 눌러서 만든다. */
  caption?: Caption;
  captionIssues?: string[];
  generation?: {
    selectedCardIndexes: number[];
    falReferenceUrls: Record<string, string>;
    startedAt: string;
    completedAt?: string;
    /**
     * 이번 만들기의 예약 열쇠. `status` 가 다 끝난 뒤 이것으로 확정한다.
     *
     * 예약과 확정이 **서로 다른 HTTP 요청**이라 열쇠를 넘길 길이 이것뿐이다.
     * 흐름 안에 두므로 저장소를 안 건드린다. 확정하고 나면 지운다 — 남겨 두면
     * 다음 만들기가 옛 열쇠로 확정한다.
     */
    reservationId?: string;
    /**
     * 예약할 때까지 **이미 쓴 값**. 확정은 그 뒤로 늘어난 만큼만 받는다.
     *
     * `flow.costs` 는 쌓이기만 하고 안 비워진다. 다시 만들기를 누르면 옛 값이
     * 그대로 남아 있어, 합계를 그냥 쓰면 **이미 낸 것을 또 받는다.**
     */
    costBaselineUsd?: number;
  };
}

export interface FlowGenerationDependencies {
  generate(card: SnsFlowCard): Promise<{ assetUrl: string; costUsd: number | null }>;
  review(card: SnsFlowCard): Promise<CardReview>;
}

function clone(flow: SnsFlowState): SnsFlowState {
  return structuredClone(flow);
}

export function updateFlowCopy(
  flow: SnsFlowState,
  cardIndex: number,
  patch: Partial<Pick<CardCopy, "headline" | "body" | "accent" | "footnote">>,
): SnsFlowState {
  const next = clone(flow);
  const card = next.cards.find((entry) => entry.index === cardIndex);
  if (!card) throw new Error("카드를 찾을 수 없습니다.");
  card.copy = { ...card.copy, ...patch };
  next.stage = "copy";
  return next;
}

async function generateOne(
  card: SnsFlowCard,
  dependencies: FlowGenerationDependencies,
): Promise<{ card: SnsFlowCard; cost: SnsFlowCost }> {
  const next = structuredClone(card);
  try {
    next.status = "generating";
    const generated = await dependencies.generate(next);
    next.assetUrl = generated.assetUrl;
    next.error = undefined;
    try {
      const review = await dependencies.review(next);
      next.review = review;
      next.reviewIssues = undefined;
      next.status = review.decision === "fail" ? "review_required" : "done";
    } catch (error) {
      next.review = undefined;
      next.reviewIssues = [error instanceof Error ? `검수 실패: ${error.message}` : "검수에 실패했습니다."];
      next.status = "review_required";
    }
    return { card: next, cost: { cardIndex: next.index, costUsd: generated.costUsd } };
  } catch (error) {
    next.status = "failed";
    next.error = error instanceof Error ? error.message : "생성에 실패했습니다.";
    return { card: next, cost: { cardIndex: next.index, costUsd: null } };
  }
}

export async function generateFlow(
  flow: SnsFlowState,
  dependencies: FlowGenerationDependencies,
): Promise<SnsFlowState> {
  const next = clone(flow);
  next.stage = "result";
  for (let offset = 0; offset < next.cards.length; offset += 1) {
    const card = next.cards[offset]!;
    if (card.kind !== "generated") {
      card.status = "done";
      card.review = undefined;
      card.reviewIssues = undefined;
      continue;
    }
    const generated = await generateOne(card, dependencies);
    next.cards[offset] = generated.card;
    next.costs.push(generated.cost);
  }
  return next;
}

export async function regenerateFlowCard(
  flow: SnsFlowState,
  cardIndex: number,
  dependencies: FlowGenerationDependencies,
): Promise<SnsFlowState> {
  const next = clone(flow);
  const offset = next.cards.findIndex((card) => card.index === cardIndex);
  if (offset < 0) throw new Error("카드를 찾을 수 없습니다.");
  const card = next.cards[offset]!;
  if (card.kind !== "generated") throw new Error("사용자 원본 카드는 다시 만들지 않습니다.");
  const generated = await generateOne(card, dependencies);
  next.cards[offset] = generated.card;
  next.costs.push(generated.cost);
  return next;
}
