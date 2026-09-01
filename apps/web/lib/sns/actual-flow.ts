import {
  CARD_RATIOS,
  buildFrame,
  composePrompt,
  generateCards,
  groupAttachments,
  layoutCards,
  planCards,
  reviewCard,
  selectReferencesForRole,
  writeCopy,
  writeImagePrompt,
  type CardGenerationDependencies,
  type CardPlan,
  type CopyProvider,
  type ImagePromptProvider,
  type PlanProvider,
  type ReviewRequest,
} from "@fixup/sns-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

function sourceText(project: SnsProjectRecord): string {
  const source = project.data.source;
  if (source.kind === "text") return source.text;
  if (source.kind === "question") return `질문: ${source.question}`;
  return `가져올 주소: ${source.url}`;
}

export interface ActualPlanningProviders {
  planningPrimary: PlanProvider;
  planningBackup: PlanProvider;
  copyPrimary: CopyProvider;
  copyBackup: CopyProvider;
}

export async function createActualPlanningFlow(
  project: SnsProjectRecord,
  providers: ActualPlanningProviders,
): Promise<SnsFlowState> {
  const planned = await planCards({
    sourceText: sourceText(project),
    slots: project.slotPlan,
    toneNote: project.toneNote,
    language: project.language,
  }, providers.planningPrimary, providers.planningBackup);
  const written = await writeCopy({
    sourceText: sourceText(project),
    plans: planned.cards,
    toneNote: project.toneNote,
    language: project.language,
  }, providers.copyPrimary, providers.copyBackup);

  if (!planned.cards.length || !written.copies.length) {
    return { stage: "copy", planningIssues: planned.issues, copyIssues: written.issues, cards: [], costs: [] };
  }

  const grouped = groupAttachments(project.data.attachments);
  const total = project.cardCountMode === "fixed"
    ? project.cardCount!
    : planned.cards.length + grouped.placeAsIs.length + 1;
  const layout = layoutCards({
    total,
    placeAsIs: grouped.placeAsIs.map((item) => ({ id: item.id, bodySlot: item.bodySlot })),
    hasEndingImage: Boolean(grouped.ending),
  });
  if (layout.issues.length) {
    return {
      stage: "copy",
      planningIssues: [...planned.issues, ...layout.issues.map((issue) => `Task 4 자리 계산 오류: ${issue}`)],
      copyIssues: written.issues,
      cards: [],
      costs: [],
    };
  }

  let generatedOffset = 0;
  const cards: SnsFlowCard[] = layout.map((slot) => {
    const isPlanned = slot.kind === "cover" || slot.kind === "generated" && slot.role === "body";
    const plan = isPlanned ? planned.cards[generatedOffset] : undefined;
    const copy = isPlanned ? written.copies[generatedOffset++] : undefined;
    const attachment = slot.attachmentId
      ? project.data.attachments.find((item) => item.id === slot.attachmentId)
      : slot.kind === "ending_image" ? grouped.ending : undefined;
    const normalizedPlan: CardPlan | undefined = plan
      ? { ...plan, index: slot.index }
      : slot.kind === "generated"
        ? { index: slot.index, role: "body", intent: "핵심 내용을 마무리한다", visualBrief: "시리즈를 마무리하는 엔딩 장면" }
        : undefined;
    return {
      index: slot.index,
      kind: slot.kind === "cover" ? "generated" : slot.kind,
      role: slot.role,
      copy: copy
        ? { ...copy, index: slot.index }
        : { index: slot.index, headline: slot.role === "ending" ? "핵심 내용을 기억해 주세요" : "사용자 원본" },
      plan: normalizedPlan,
      attachmentId: attachment?.id,
      assetUrl: attachment?.url,
      assetPath: attachment?.assetPath,
      status: "pending",
    };
  });
  return { stage: "copy", planningIssues: planned.issues, copyIssues: written.issues, cards, costs: [] };
}

export interface ActualGenerationDependencies {
  sceneProvider: ImagePromptProvider;
  reviewPrimary: ReviewRequest;
  reviewBackup: ReviewRequest;
  generation: CardGenerationDependencies;
  getAssetUrl(path: string): Promise<string>;
  getReviewAssetUrl?(path: string): Promise<string>;
  savePrompt(cardIndex: number, prompt: string): Promise<void>;
  saveReview(cardIndex: number, status: "done" | "review_required", review: unknown, issues: string[]): Promise<void>;
  saveOriginal(card: SnsFlowCard): Promise<{ assetPath: string; assetUrl: string }>;
}

export async function generateActualFlow(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  dependencies: ActualGenerationDependencies,
  options: { cardIndexes?: number[]; appendCosts?: boolean } = {},
): Promise<SnsFlowState> {
  const next = structuredClone(flow);
  next.stage = "result";
  if (options.appendCosts === false) next.costs = [];
  const selected = new Set(options.cardIndexes ?? next.cards.map((card) => card.index));
  const grouped = groupAttachments(project.data.attachments);
  const ratio = CARD_RATIOS.find((entry) => entry.id === project.ratio);
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${project.ratio}`);

  for (const card of next.cards.filter((entry) => selected.has(entry.index) && entry.kind !== "generated")) {
    try {
      const saved = await dependencies.saveOriginal(card);
      card.assetPath = saved.assetPath;
      card.assetUrl = saved.assetUrl;
      card.status = "done";
      card.review = undefined;
      card.reviewIssues = undefined;
      card.error = undefined;
    } catch (error) {
      card.status = "failed";
      card.error = error instanceof Error ? error.message : "사용자 원본을 저장하지 못했습니다.";
    }
  }

  const jobs = [];
  const promptWarnings = new Map<number, string[]>();
  for (const card of next.cards.filter((entry) => selected.has(entry.index) && entry.kind === "generated")) {
    const plan = card.plan ?? { index: card.index, role: card.role === "cover" ? "cover" as const : "body" as const, intent: card.copy.headline, visualBrief: card.copy.body ?? card.copy.headline };
    const prompted = await writeImagePrompt({
      role: card.role,
      copy: card.copy,
      plan,
      grouped,
      size: ratio.pixel,
      language: project.language,
    }, dependencies.sceneProvider);
    const images = selectReferencesForRole(grouped, card.role);
    const prompt = composePrompt(buildFrame({ copy: card.copy, images, size: ratio.pixel, language: project.language }), prompted.body);
    promptWarnings.set(card.index, prompted.warnings);
    await dependencies.savePrompt(card.index, prompt);
    jobs.push({
      kind: "generated" as const,
      projectId: project.id,
      cardIndex: card.index,
      modelId: project.modelId,
      ratioId: project.ratio,
      prompt,
      imageUrls: images.map((image) => image.url),
    });
  }

  const results = await generateCards(jobs, dependencies.generation);
  for (const result of results) {
    const card = next.cards.find((entry) => entry.index === result.cardIndex)!;
    next.costs.push({ cardIndex: card.index, costUsd: result.request?.costUsd ?? null });
    if (result.status === "failed" || !result.assetPath) {
      card.status = "failed";
      card.error = result.error ?? "이미지를 만들지 못했습니다.";
      continue;
    }
    card.assetPath = result.assetPath;
    card.assetUrl = await dependencies.getAssetUrl(result.assetPath);
    card.error = undefined;
    const reviewed = await reviewCard({
      kind: "generated",
      imageUrl: dependencies.getReviewAssetUrl
        ? await dependencies.getReviewAssetUrl(result.assetPath)
        : card.assetUrl,
      copy: card.copy,
      preservedImageUrls: grouped.keepIdentity.map((image) => image.url),
    }, dependencies.reviewPrimary, dependencies.reviewBackup);
    card.review = reviewed.review;
    card.reviewIssues = [...(promptWarnings.get(card.index) ?? []), ...reviewed.issues];
    const reviewStatus = reviewed.status === "skipped" ? "done" : reviewed.status;
    card.status = reviewStatus;
    await dependencies.saveReview(card.index, reviewStatus, reviewed.review ?? null, card.reviewIssues);
  }
  return next;
}

export function regenerateActualFlowCard(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  cardIndex: number,
  dependencies: ActualGenerationDependencies,
) {
  const card = flow.cards.find((entry) => entry.index === cardIndex);
  if (!card) throw new Error("카드를 찾을 수 없습니다.");
  if (card.kind !== "generated") throw new Error("사용자 원본 카드는 다시 만들지 않습니다.");
  return generateActualFlow(project, flow, dependencies, { cardIndexes: [cardIndex], appendCosts: true });
}
