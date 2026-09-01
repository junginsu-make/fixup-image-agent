import {
  CARD_RATIOS,
  buildFrame,
  buildModelInput,
  composePrompt,
  groupAttachments,
  modelById,
  pickEndpoint,
  resolveSize,
  reviewCard,
  selectReferencesForRole,
  unitPrice,
  writeImagePrompt,
  type Attachment,
  type GenerationRequestComplete,
  type GenerationRequestCreate,
  type ImagePromptProvider,
  type ReviewRequest,
} from "@fixup/sns-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

export const QUEUE_POLL_INTERVAL_MS = 10_000;
export const QUEUE_GIVE_UP_MS = 30 * 60_000;

export interface QueueSubmission {
  requestId: string;
  statusUrl: string;
  responseUrl: string;
  endpoint?: string;
}

export type QueueStatus =
  | { state: "queued" }
  | { state: "in_progress" }
  | { state: "completed"; images: Array<{ url: string }> }
  | { state: "failed"; error: string };

export interface FalQueue {
  submit(endpoint: string, input: Record<string, unknown>, cardIndex: number): Promise<QueueSubmission>;
  status(submission: QueueSubmission, cardIndex: number): Promise<QueueStatus>;
}

export interface SubmittedGenerationRequestStore {
  createSubmitted(row: GenerationRequestCreate & { falRequestId: string }): Promise<{ id: string }>;
  complete(id: string, patch: GenerationRequestComplete): Promise<void>;
}

export interface QueuedGenerationDependencies {
  sceneProvider: ImagePromptProvider;
  reviewPrimary: ReviewRequest;
  reviewBackup: ReviewRequest;
  uploadReference(attachment: Attachment): Promise<string>;
  queue: FalQueue;
  requestStore: SubmittedGenerationRequestStore;
  savePrompt(cardIndex: number, prompt: string): Promise<void>;
  saveSubmitted(cardIndex: number): Promise<void>;
  saveFailed(cardIndex: number, message: string): Promise<void>;
  saveAsset(imageUrl: string, card: SnsFlowCard): Promise<{ assetPath: string; assetUrl: string; reviewUrl: string }>;
  saveReview(cardIndex: number, status: "done" | "review_required", review: unknown, issues: string[]): Promise<void>;
  saveOriginal(card: SnsFlowCard): Promise<{ assetPath: string; assetUrl: string }>;
  checkpoint?(flow: SnsFlowState): Promise<void>;
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

function queueSubmission(card: SnsFlowCard): QueueSubmission {
  if (!card.falRequestId || !card.generationStatusUrl || !card.generationResponseUrl) {
    throw new Error(`${card.index}번 카드의 fal 큐 정보가 없습니다.`);
  }
  return {
    requestId: card.falRequestId,
    statusUrl: card.generationStatusUrl,
    responseUrl: card.generationResponseUrl,
    endpoint: card.generationEndpoint,
  };
}

async function submitNext(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  dependencies: QueuedGenerationDependencies,
  now: string,
): Promise<void> {
  const selected = new Set(flow.generation?.selectedCardIndexes ?? []);
  const card = flow.cards.find((entry) => selected.has(entry.index) && entry.kind === "generated" && entry.status === "pending");
  if (!card) {
    if (flow.generation && !flow.cards.some((entry) => selected.has(entry.index) && ["pending", "generating"].includes(entry.status))) {
      flow.generation.completedAt = now;
      await dependencies.checkpoint?.(flow);
    }
    return;
  }
  if (!card.prompt) throw new Error(`${card.index}번 카드 이미지 프롬프트가 없습니다.`);
  const grouped = groupAttachments(project.data.attachments);
  const references = selectReferencesForRole(grouped, card.role);
  const falUrls = flow.generation?.falReferenceUrls ?? {};
  const imageUrls = references.map((reference) => falUrls[reference.id]).filter((url): url is string => Boolean(url));
  if (imageUrls.length !== references.length) throw new Error(`${card.index}번 카드의 fal 레퍼런스 URL이 없습니다.`);
  const model = modelById(project.modelId);
  const resolved = resolveSize(project.ratio, model);
  if (resolved.rejected) throw new Error(resolved.rejected);
  const mode = imageUrls.length ? "i2i" as const : "t2i" as const;
  const endpoint = pickEndpoint(model, mode === "i2i");
  const unitCostUsd = unitPrice(model, mode, resolved.pixel ?? { width: 1, height: 1 });

  // 과금 요청은 정확히 한 번 제출하고, 돌아온 request_id를 바로 장부에 쓴다.
  const submitted = await dependencies.queue.submit(
    endpoint,
    buildModelInput(model, mode, resolved, card.prompt, imageUrls),
    card.index,
  );
  const request = await dependencies.requestStore.createSubmitted({
    projectId: project.id,
    cardIndex: card.index,
    modelId: project.modelId,
    mode,
    size: resolved,
    requestedImages: 1,
    unitCostUsd,
    falRequestId: submitted.requestId,
  });
  card.status = "generating";
  card.error = undefined;
  card.falRequestId = submitted.requestId;
  card.generationRequestId = request.id;
  card.generationEndpoint = endpoint;
  card.generationStatusUrl = submitted.statusUrl;
  card.generationResponseUrl = submitted.responseUrl;
  card.generationStartedAt = now;
  flow.costs.push({
    cardIndex: card.index,
    costUsd: null,
    unitCostUsd,
    falRequestId: submitted.requestId,
    generationRequestId: request.id,
  });
  await dependencies.saveSubmitted(card.index);
  await dependencies.checkpoint?.(flow);
}

export async function startQueuedFlow(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  dependencies: QueuedGenerationDependencies,
  options: { cardIndexes?: number[]; now?: string } = {},
): Promise<SnsFlowState> {
  const next = structuredClone(flow);
  const now = nowIso(options.now);
  const selectedIndexes = options.cardIndexes ?? next.cards.map((card) => card.index);
  const selected = new Set(selectedIndexes);
  const grouped = groupAttachments(project.data.attachments);
  const referenceIds = new Set<string>();
  for (const card of next.cards.filter((entry) => selected.has(entry.index) && entry.kind === "generated")) {
    selectReferencesForRole(grouped, card.role).forEach((reference) => referenceIds.add(reference.id));
  }
  const falReferenceUrls: Record<string, string> = {};
  for (const attachment of project.data.attachments) {
    if (referenceIds.has(attachment.id)) falReferenceUrls[attachment.id] = await dependencies.uploadReference(attachment);
  }
  next.stage = "result";
  next.generation = { selectedCardIndexes: selectedIndexes, falReferenceUrls, startedAt: now };

  const ratio = CARD_RATIOS.find((entry) => entry.id === project.ratio);
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${project.ratio}`);
  for (const card of next.cards.filter((entry) => selected.has(entry.index))) {
    card.error = undefined;
    card.review = undefined;
    card.reviewIssues = undefined;
    if (card.kind !== "generated") {
      try {
        const saved = await dependencies.saveOriginal(card);
        card.assetPath = saved.assetPath;
        card.assetUrl = saved.assetUrl;
        card.status = "done";
      } catch (error) {
        card.status = "failed";
        card.error = error instanceof Error ? error.message : "사용자 원본을 저장하지 못했습니다.";
      }
      continue;
    }
    const plan = card.plan ?? {
      index: card.index,
      role: card.role === "cover" ? "cover" as const : "body" as const,
      intent: card.copy.headline,
      visualBrief: card.copy.body ?? card.copy.headline,
    };
    const prompted = await writeImagePrompt({
      role: card.role,
      copy: card.copy,
      plan,
      grouped,
      size: ratio.pixel,
      language: project.language,
    }, dependencies.sceneProvider);
    const images = selectReferencesForRole(grouped, card.role);
    card.prompt = composePrompt(buildFrame({ copy: card.copy, images, size: ratio.pixel, language: project.language }), prompted.body);
    card.promptWarnings = prompted.warnings;
    card.status = "pending";
    card.falRequestId = undefined;
    card.generationRequestId = undefined;
    card.generationEndpoint = undefined;
    card.generationStatusUrl = undefined;
    card.generationResponseUrl = undefined;
    card.generationStartedAt = undefined;
    await dependencies.savePrompt(card.index, card.prompt);
  }
  await submitNext(project, next, dependencies, now);
  return next;
}

export async function pollQueuedFlow(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  dependencies: QueuedGenerationDependencies,
  options: { now?: string } = {},
): Promise<SnsFlowState> {
  const next = structuredClone(flow);
  const now = nowIso(options.now);
  const selected = new Set(next.generation?.selectedCardIndexes ?? []);
  const card = next.cards.find((entry) => selected.has(entry.index) && entry.status === "generating");
  if (!card) {
    await submitNext(project, next, dependencies, now);
    return next;
  }
  const elapsed = Date.parse(now) - Date.parse(card.generationStartedAt ?? now);
  if (elapsed > QUEUE_GIVE_UP_MS) {
    card.status = "failed";
    card.error = `30분 동안 fal 상태가 끝나지 않아 조회를 중단했습니다. request_id ${card.falRequestId ?? "없음"}은 장부에 남겼습니다.`;
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  const status = await dependencies.queue.status(queueSubmission(card), card.index);
  if (status.state === "queued" || status.state === "in_progress") return next;
  if (status.state === "failed") {
    card.status = "failed";
    card.error = status.error;
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  if (!card.generationRequestId) throw new Error(`${card.index}번 카드 비용 장부 ID가 없습니다.`);
  const cost = next.costs.find((entry) => entry.generationRequestId === card.generationRequestId);
  if (!cost?.unitCostUsd) throw new Error(`${card.index}번 카드 단가가 없습니다.`);
  const completed: GenerationRequestComplete = {
    falRequestId: card.falRequestId,
    returnedImages: status.images.length,
    costUsd: cost.unitCostUsd,
  };
  // fal 완료 직후 비용부터 확정하고, 그 다음에 결과 파일을 저장한다.
  await dependencies.requestStore.complete(card.generationRequestId, completed);
  cost.costUsd = completed.costUsd;
  const image = status.images[0];
  if (!image) {
    card.status = "failed";
    card.error = "fal 완료 응답에 이미지가 없습니다.";
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  const saved = await dependencies.saveAsset(image.url, card);
  card.assetPath = saved.assetPath;
  card.assetUrl = saved.assetUrl;
  const grouped = groupAttachments(project.data.attachments);
  const reviewed = await reviewCard({
    kind: "generated",
    imageUrl: saved.reviewUrl,
    copy: card.copy,
    preservedImageUrls: grouped.keepIdentity.map((attachment) => attachment.url),
  }, dependencies.reviewPrimary, dependencies.reviewBackup);
  card.review = reviewed.review;
  card.reviewIssues = [...(card.promptWarnings ?? []), ...reviewed.issues];
  card.status = reviewed.status === "skipped" ? "done" : reviewed.status;
  card.error = undefined;
  await dependencies.saveReview(card.index, card.status, card.review ?? null, card.reviewIssues);
  await dependencies.checkpoint?.(next);
  await submitNext(project, next, dependencies, now);
  return next;
}

export function hasActiveQueuedGeneration(flow?: SnsFlowState): boolean {
  if (!flow?.generation || flow.generation.completedAt) return false;
  const selected = new Set(flow.generation.selectedCardIndexes);
  return flow.cards.some((card) => selected.has(card.index) && (card.status === "pending" || card.status === "generating"));
}
