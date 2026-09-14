import {
  CARD_RATIOS,
  buildAttachmentBlock,
  buildFrame,
  buildModelInput,
  composePrompt,
  intentForRole,
  mergedInstruction,
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
  type PromptTuning,
  type ReviewRequest,
} from "@fixup/sns-core";
import {
  buildSlotPrompt,
  planSlotImage,
  slotRect,
  type LayoutSlot,
} from "@fixup/layout-core";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import type { FalQueueClient } from "../fal/queue";
import { uploadUniqueReferences } from "../fal/upload";

export const QUEUE_POLL_INTERVAL_MS = 10_000;

/** 작업에 저장된 지시와 이번에 적은 말 사이. */
const NOTE_SEPARATOR = String.fromCharCode(10);
export const QUEUE_GIVE_UP_MS = 30 * 60_000;

export interface SubmittedGenerationRequestStore {
  createSubmitted(row: GenerationRequestCreate & { falRequestId: string }): Promise<{ id: string }>;
  complete(id: string, patch: GenerationRequestComplete): Promise<void>;
}

export interface QueuedGenerationDependencies {
  /** Durable execution owns timeouts and submission identity outside the UI flow. */
  durable?: boolean;
  submitImage?(input: { endpoint: string; input: Record<string, unknown>; cardIndex: number; slot?: number; modelId: string; unitCostUsd: number }): Promise<{ requestId: string }>;
  sceneProvider: ImagePromptProvider;
  reviewPrimary: ReviewRequest;
  reviewBackup: ReviewRequest;
  uploadReference(attachment: Attachment): Promise<string>;
  queue: FalQueueClient;
  requestStore: SubmittedGenerationRequestStore;
  savePrompt(cardIndex: number, prompt: string): Promise<void>;
  saveSubmitted(cardIndex: number): Promise<void>;
  saveFailed(cardIndex: number, message: string): Promise<void>;
  /**
   * 통짜 카드면 그림 주소 하나, 레이아웃 카드면 **칸 번호별 그림**이다.
   * 그림 칸이 없는 레이아웃은 빈 목록으로 온다 — 글과 배경만으로 합성한다.
   */
  saveAsset(
    images: string | Record<number, string>,
    card: SnsFlowCard,
  ): Promise<{ assetPath: string; thumbPath: string | null; assetUrl: string; reviewUrl: string }>;
  saveReview(cardIndex: number, status: "done" | "review_required", review: unknown, issues: string[]): Promise<void>;
  saveOriginal(card: SnsFlowCard): Promise<{ assetPath: string; thumbPath: string | null; assetUrl: string }>;
  checkpoint?(flow: SnsFlowState): Promise<void>;
}

function nowIso(value?: string): string {
  return value ?? new Date().toISOString();
}

/** 틀의 그림 칸 전부. 자리 번호를 함께 준다 — 합성할 때 그 번호로 꽂는다. */
function imageSlotsOf(card: SnsFlowCard): Array<{ slot: number; box: Extract<LayoutSlot, { kind: "image" }> }> {
  return (card.layout?.slots ?? []).flatMap((slot, offset) => (
    slot.kind === "image" ? [{ slot: offset, box: slot }] : []
  ));
}

function cardPixels(project: SnsProjectRecord) {
  const ratio = CARD_RATIOS.find((entry) => entry.id === project.ratio);
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${project.ratio}`);
  return ratio.pixel;
}

/** 그 칸을 fal 에 시킬 모델과 크기. 칸마다 비율이 달라 저마다 셈한다. */
function slotPlanFor(card: SnsFlowCard, project: SnsProjectRecord, slotOffset: number) {
  const found = imageSlotsOf(card).find((entry) => entry.slot === slotOffset);
  if (!found) return undefined;
  const rect = slotRect(found.box.box, cardPixels(project));
  return planSlotImage({ width: rect.width, height: rect.height }, project.modelId);
}

/** Freeze the exact model/size price used by submission before admitting a run. */
export function quoteQueuedImages(project: SnsProjectRecord, flow: SnsFlowState, selected: number[]) {
  const grouped=groupAttachments(project.data.attachments);
  return flow.cards.filter(c=>selected.includes(c.index)&&c.kind==="generated").flatMap(card=>{
    const slots: Array<number|undefined> = card.layout ? imageSlotsOf(card).map(s=>s.slot) : [undefined];
    return slots.map(slot=>{
      const plan=slot===undefined?undefined:slotPlanFor(card,project,slot);
      const model=plan?.model??modelById(project.modelId);
      const resolved=plan?.size??resolveSize(project.ratio,model);
      if(resolved.rejected)throw new Error(resolved.rejected);
      const mode=selectReferencesForRole(grouped,card.role).length?"i2i" as const:"t2i" as const;
      return {step:`image:${card.index}:${slot??"whole"}`,modelId:model.id,endpoint:pickEndpoint(model,mode==="i2i"),
        mode,size:resolved,unitCostUsd:unitPrice(model,mode,resolved.pixel??{width:1,height:1})};
    });
  });
}

/** 다 왔나. 실패한 칸은 기다리지 않는다 — 나머지로 카드는 만든다. */
function slotJobsSettled(card: SnsFlowCard): boolean {
  return (card.slotJobs ?? []).every((job) => job.status === "done" || job.status === "failed");
}

/** 합성에 넘길 칸별 그림. 못 받은 칸은 빠지고 그 자리는 회색으로 남는다. */
function slotImagesOf(card: SnsFlowCard): Record<number, string> {
  const images: Record<number, string> = {};
  for (const job of card.slotJobs ?? []) if (job.imageUrl) images[job.slot] = job.imageUrl;
  return images;
}

/**
 * 칸이 다 왔으니 합성해서 저장한다.
 *
 * 한 칸이 실패해도 카드는 나온다 — 그 자리만 회색으로 남고 화면이 이유를 말한다.
 */
async function composeAndSave(
  card: SnsFlowCard,
  dependencies: QueuedGenerationDependencies,
): Promise<void> {
  try {
    const saved = await dependencies.saveAsset(slotImagesOf(card), card);
    card.assetPath = saved.assetPath;
    // **여기가 읽는 쪽의 유일한 근거다.** 표에만 적으면 목록·삭제가 보는 이
    // 흐름에는 값이 없어서, 미리보기가 만들어지되 아무도 못 찾는다.
    card.thumbPath = saved.thumbPath;
    card.assetUrl = saved.assetUrl;
    card.status = "done";
    const failed = (card.slotJobs ?? []).filter((job) => job.status === "failed");
    card.reviewIssues = failed.length
      ? failed.map((job) => `${job.slot + 1}번 칸 그림을 받지 못했습니다: ${job.error ?? "이유 없음"}`)
      : undefined;
    card.error = undefined;
  } catch (error) {
    if (dependencies.durable) throw error;
    card.status = "failed";
    card.error = error instanceof Error ? error.message : "카드를 합성하지 못했습니다.";
  }
}

function queueIdentity(card: SnsFlowCard): { endpoint: string; requestId: string } {
  if (!card.falRequestId || !card.generationEndpoint) {
    throw new Error(`${card.index}번 카드의 fal 큐 정보가 없습니다.`);
  }
  return {
    endpoint: card.generationEndpoint,
    requestId: card.falRequestId,
  };
}

async function submitNext(
  project: SnsProjectRecord,
  flow: SnsFlowState,
  dependencies: QueuedGenerationDependencies,
  now: string,
): Promise<void> {
  const selected = new Set(flow.generation?.selectedCardIndexes ?? []);
  // 레이아웃 카드는 칸이 여럿이라 「생성 중」이면서도 아직 안 보낸 칸이 남는다.
  const card = flow.cards.find((entry) => (
    selected.has(entry.index)
    && entry.kind === "generated"
    && (entry.status === "pending" || (entry.status === "generating" && entry.slotJobs?.some((job) => job.status === "pending")))
    && !entry.slotJobs?.some((job) => job.status === "generating")
  ));
  if (!card) {
    if (flow.generation && !flow.cards.some((entry) => selected.has(entry.index) && ["pending", "generating"].includes(entry.status))) {
      flow.generation.completedAt = now;
      await dependencies.checkpoint?.(flow);
    }
    return;
  }
  const grouped = groupAttachments(project.data.attachments);
  const references = selectReferencesForRole(grouped, card.role);
  const falUrls = flow.generation?.falReferenceUrls ?? {};
  const imageUrls = references.map((reference) => falUrls[reference.id]).filter((url): url is string => Boolean(url));
  if (imageUrls.length !== references.length) throw new Error(`${card.index}번 카드의 fal 레퍼런스 URL이 없습니다.`);

  /**
   * 레이아웃 카드는 **칸 하나가 요청 하나**다.
   *
   * 그림 자리가 셋이면 셋 다 채워야 「레퍼런스 그대로」가 된다. 칸마다 주문서가
   * 다르므로(「수리 전」과 「수리 후」) 한 번에 시킬 수 없다. 한 번에 하나씩
   * 보내는 것은 그대로 두고, 단위만 카드에서 칸으로 바꾼다.
   */
  const job = card.slotJobs?.find((entry) => entry.status === "pending");
  const prompt = job?.prompt ?? card.prompt;
  if (!prompt) throw new Error(`${card.index}번 카드 이미지 프롬프트가 없습니다.`);

  const slotPlan = job ? slotPlanFor(card, project, job.slot) : undefined;
  const model = slotPlan?.model ?? modelById(project.modelId);
  const resolved = slotPlan?.size ?? resolveSize(project.ratio, model);
  if (resolved.rejected) throw new Error(resolved.rejected);
  const mode = imageUrls.length ? "i2i" as const : "t2i" as const;
  const endpoint = pickEndpoint(model, mode === "i2i");
  const unitCostUsd = unitPrice(model, mode, resolved.pixel ?? { width: 1, height: 1 });

  // 과금 요청은 정확히 한 번 제출하고, 돌아온 request_id를 바로 장부에 쓴다.
  const payload = buildModelInput(model, mode, resolved, prompt, imageUrls);
  const submitted = dependencies.submitImage
    ? await dependencies.submitImage({ endpoint, input: payload, cardIndex: card.index, slot: job?.slot, modelId: model.id, unitCostUsd })
    : await dependencies.queue.submitJob(endpoint, payload);
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
  if (job) {
    job.status = "generating";
    job.falRequestId = submitted.requestId;
    job.generationRequestId = request.id;
    job.endpoint = endpoint;
    job.startedAt = now;
  } else {
    card.falRequestId = submitted.requestId;
    card.generationRequestId = request.id;
    card.generationEndpoint = endpoint;
    card.generationStartedAt = now;
  }
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
  /**
   * `note` 는 **낱장을 다시 만들 때 사람이 그 자리에서 적는 말**이다.
   * 작업에 저장된 지시(`data.userInstruction`)를 지우지 않고 **덧붙인다** —
   * 이번 한 번만 쓰고 흐름에 남기지 않는다.
   */
  options: { cardIndexes?: number[]; now?: string; note?: string; deferSubmit?: boolean } = {},
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
  const falReferenceUrls = await uploadUniqueReferences(
    project.data.attachments.filter((attachment) => referenceIds.has(attachment.id)),
    (attachment) => attachment.id,
    dependencies.uploadReference,
  );
  next.stage = "result";
  next.generation = { selectedCardIndexes: selectedIndexes, falReferenceUrls, startedAt: now };

  const ratio = CARD_RATIOS.find((entry) => entry.id === project.ratio);
  if (!ratio) throw new Error(`지원하지 않는 비율입니다: ${project.ratio}`);
  // 화면에서 고른 결과 직접 친 지시. 예전에 만든 작업에는 없어서 `auto` 와
  // 빈 문자열로 읽힌다 — 그러면 지금까지와 똑같이 동작한다.
  const note = options.note?.trim();
  const tuning: PromptTuning = {
    look: project.data.look,
    // 적은 말을 **뒤에** 붙인다. 뒤에 온 말이 앞말을 덮는 것이 사람의 기대다.
    userInstruction: [project.data.userInstruction?.trim(), note].filter(Boolean).join(NOTE_SEPARATOR) || undefined,
  };
  /**
   * 자리마다 사용자가 적은 말 (표지/속지/엔딩).
   *
   * **`tuning` 에 안 넣는다.** `tuning` 은 카드 전체에 똑같이 가는 것이고, 이건
   * 카드 자리마다 달라야 한다 — 표지 지시가 속지에 새면 안 된다. 그래서 카드를
   * 돌 때마다 그 자리 것을 골라 넣는다.
   */
  const intents = project.data.attachmentIntents;
  for (const card of next.cards.filter((entry) => selected.has(entry.index))) {
    card.error = undefined;
    card.review = undefined;
    card.reviewIssues = undefined;
    if (card.kind !== "generated") {
      try {
        const saved = await dependencies.saveOriginal(card);
        card.assetPath = saved.assetPath;
        card.thumbPath = saved.thumbPath;
        card.assetUrl = saved.assetUrl;
        card.status = "done";
      } catch (error) {
        if (dependencies.durable) throw error;
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
    if (card.layout) {
      // 칸 프롬프트는 카드 전체가 아니라 그 칸에 들어갈 그림만 말한다.
      // 모델에게 물어볼 것이 없으므로 장면 프롬프트 LLM 호출도 건너뛴다.
      const styleBlock = buildAttachmentBlock(selectReferencesForRole(grouped, card.role), {
        ...tuning,
        attachmentIntent: intentForRole(intents, card.role),
      });
      const fallbackBrief = card.plan?.visualBrief ?? card.copy.body ?? card.copy.headline;

      card.slotJobs = imageSlotsOf(card).map(({ slot, box }) => {
        const rect = slotRect(box.box, ratio.pixel);
        return {
          slot,
          prompt: buildSlotPrompt({
            slot: box,
            rect: { width: rect.width, height: rect.height },
            visualBrief: fallbackBrief,
            styleBlock,
            look: tuning.look,
            /**
             * **여기도 합친 말을 넘긴다.**
             *
             * 칸 프롬프트만 `userInstruction` 을 그대로 넘기면 레이아웃 카드에서만
             * 첨부 지시가 사라진다 — 같은 작업 안에서 카드마다 다르게 도는 것이
             * 가장 찾기 어려운 고장이다(2026-09-08 리뷰).
             */
            userInstruction: mergedInstruction({
              userInstruction: tuning.userInstruction,
              attachmentIntent: intentForRole(intents, card.role),
            }),
          }),
          status: "pending" as const,
        };
      });
      card.promptWarnings = imageSlotsOf(card).flatMap(
        ({ slot }) => slotPlanFor(card, project, slot)?.notes ?? [],
      );
      // 칸마다 주문서가 다르다. 카드 하나짜리 prompt 는 더 이상 뜻이 없다.
      card.prompt = undefined;
      card.falRequestId = undefined;
      card.generationRequestId = undefined;
      card.generationEndpoint = undefined;
      card.generationStartedAt = undefined;

      if (card.slotJobs.length === 0) {
        // 그림 칸이 없는 틀은 fal 을 부를 일이 없다. 바로 합성해서 끝낸다.
        await composeAndSave(card, dependencies);
        continue;
      }
      card.status = "pending";
      // 화면이 프롬프트를 하나로 본다. 칸마다 무엇을 시켰는지 이어 붙여 남긴다.
      const joined = card.slotJobs.map((job) => `${job.slot + 1}번 칸: ${job.prompt}`).join("\n\n");
      await dependencies.savePrompt(card.index, joined);
      continue;
    }

    const prompted = await writeImagePrompt({
      role: card.role,
      copy: card.copy,
      plan,
      grouped,
      size: ratio.pixel,
      language: project.language,
      ...tuning,
      attachmentIntents: intents,
    }, dependencies.sceneProvider);
    const images = selectReferencesForRole(grouped, card.role);
    /**
     * **이 카드의 자리 지시까지 넣어 하나로 만든다.**
     *
     * `buildFrame` 에만 넣고 `composePrompt` 에 `tuning` 을 그대로 주면, 맨 앞·맨
     * 뒤의 「USER INSTRUCTION」 블록이 자리 지시를 못 받는다 — 첨부 설명은
     * 「사용자가 적은 말을 따르라」고 하는데 그 말이 없는 상태가 된다
     * (2026-09-08 시험이 잡았다).
     */
    const cardTuning = { ...tuning, attachmentIntent: intentForRole(intents, card.role) };
    card.prompt = composePrompt(
      buildFrame({
        copy: card.copy, images, size: ratio.pixel, language: project.language, ...cardTuning,
      }),
      prompted.body,
      cardTuning,
    );
    card.promptWarnings = prompted.warnings;
    card.status = "pending";
    card.falRequestId = undefined;
    card.generationRequestId = undefined;
    card.generationEndpoint = undefined;
    card.generationStartedAt = undefined;
    await dependencies.savePrompt(card.index, card.prompt);
  }
  if (!options.deferSubmit) await submitNext(project, next, dependencies, now);
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
  /**
   * 레이아웃 카드는 지금 돌고 있는 **칸**을 본다.
   *
   * 카드 하나에 요청이 여럿이라, 카드에 붙은 요청 정보 하나로는 어느 칸을
   * 기다리는지 알 수 없다.
   */
  const job = card.slotJobs?.find((entry) => entry.status === "generating");
  const startedAt = job?.startedAt ?? card.generationStartedAt;
  const requestId = job?.falRequestId ?? card.falRequestId;
  const ledgerId = job?.generationRequestId ?? card.generationRequestId;

  /** 이 칸(또는 이 카드)이 끝났다. 남은 칸이 있으면 계속, 다 됐으면 합성한다. */
  const afterSlot = async (): Promise<SnsFlowState> => {
    if (card.slotJobs) {
      if (!slotJobsSettled(card)) {
        await dependencies.checkpoint?.(next);
        await submitNext(project, next, dependencies, now);
        return next;
      }
      await composeAndSave(card, dependencies);
      if (card.status === "failed") await dependencies.saveFailed(card.index, card.error ?? "");
      await dependencies.checkpoint?.(next);
      await submitNext(project, next, dependencies, now);
      return next;
    }
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  };

  const elapsed = Date.parse(now) - Date.parse(startedAt ?? now);
  if (!dependencies.durable && elapsed > QUEUE_GIVE_UP_MS) {
    const message = `30분 동안 fal 상태가 끝나지 않아 조회를 중단했습니다. request_id ${requestId ?? "없음"}은 장부에 남겼습니다.`;
    if (job) {
      job.status = "failed";
      job.error = message;
      return afterSlot();
    }
    card.status = "failed";
    card.error = message;
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  const identity = job?.endpoint && job.falRequestId
    ? { endpoint: job.endpoint, requestId: job.falRequestId }
    : queueIdentity(card);
  const status = await dependencies.queue.jobStatus(identity.endpoint, identity.requestId);
  if (status === "queued" || status === "in_progress") return next;
  let result: { images: Array<{ url: string }> };
  try {
    result = await dependencies.queue.jobResult(identity.endpoint, identity.requestId);
  } catch (error) {
    if (dependencies.durable) throw error;
    const message = error instanceof Error ? error.message : "fal 결과를 읽지 못했습니다.";
    if (job) {
      // 한 칸이 실패해도 나머지로 카드는 만든다.
      job.status = "failed";
      job.error = message;
      return afterSlot();
    }
    card.status = "failed";
    card.error = message;
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  if (!ledgerId) throw new Error(`${card.index}번 카드 비용 장부 ID가 없습니다.`);
  const cost = next.costs.find((entry) => entry.generationRequestId === ledgerId);
  if (!cost?.unitCostUsd) throw new Error(`${card.index}번 카드 단가가 없습니다.`);
  const completed: GenerationRequestComplete = {
    falRequestId: requestId,
    returnedImages: result.images.length,
    costUsd: cost.unitCostUsd,
  };
  // fal 완료 직후 비용부터 확정하고, 그 다음에 결과 파일을 저장한다.
  await dependencies.requestStore.complete(ledgerId, completed);
  cost.costUsd = completed.costUsd;
  const image = result.images[0];
  if (!image) {
    const message = "fal 완료 응답에 이미지가 없습니다.";
    if (job) {
      job.status = "failed";
      job.error = message;
      return afterSlot();
    }
    card.status = "failed";
    card.error = message;
    await dependencies.saveFailed(card.index, card.error);
    await dependencies.checkpoint?.(next);
    await submitNext(project, next, dependencies, now);
    return next;
  }
  if (job) {
    // 받아 두고 다른 칸을 기다린다. 다 오면 한 번에 합성한다.
    job.status = "done";
    job.imageUrl = image.url;
    job.error = undefined;
    return afterSlot();
  }
  const saved = await dependencies.saveAsset(image.url, card);
  card.assetPath = saved.assetPath;
  card.thumbPath = saved.thumbPath;
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

/**
 * 사람이 중지를 눌렀다.
 *
 * fal 에 이미 보낸 요청은 취소하지 못한다. 우리가 그만두는 것은 **결과를
 * 받아 오는 일**뿐이고, 보낸 요청의 비용은 그대로 나간다. 그러니 중지는
 * 되돌리기가 아니라 멈춤이다 — 받아 둔 카드는 그대로 남는다.
 */
export function stopQueuedGeneration(flow: SnsFlowState, stoppedAt: string): SnsFlowState {
  const next = structuredClone(flow);
  next.cards = next.cards.map((card) => (
    card.status === "pending" || card.status === "generating"
      ? { ...card, status: "failed" as const, error: "사람이 중지했습니다. 필요하면 이 카드만 다시 만드세요." }
      : card
  ));
  if (next.generation) next.generation = { ...next.generation, completedAt: stoppedAt };
  return next;
}

export function hasActiveQueuedGeneration(flow?: SnsFlowState): boolean {
  if (!flow?.generation || flow.generation.completedAt) return false;
  const selected = new Set(flow.generation.selectedCardIndexes);
  return flow.cards.some((card) => selected.has(card.index) && (card.status === "pending" || card.status === "generating"));
}
