import type { CardCopy, CardReview } from "@fixup/sns-core";

export interface SnsFlowCard {
  index: number;
  kind: "generated" | "place_as_is" | "ending_image";
  role: "cover" | "body" | "ending";
  copy: CardCopy;
  status: "pending" | "generating" | "review_required" | "done" | "failed";
  assetUrl?: string;
  review?: CardReview;
  reviewIssues?: string[];
  error?: string;
}

export interface SnsFlowCost {
  cardIndex: number;
  costUsd: number | null;
}

export interface SnsFlowState {
  stage: "copy" | "result";
  planningIssues: string[];
  copyIssues: string[];
  cards: SnsFlowCard[];
  costs: SnsFlowCost[];
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
  next.costs = [];
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
