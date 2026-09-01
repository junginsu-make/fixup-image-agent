import type { LetterboxPlan } from "./letterbox";
import { modelById, pickEndpoint, unitPrice, type ImageMode, type ImageModel } from "./models";
import { resolveSize, type ResolvedSize } from "./ratios";

export interface GenerationRequestCreate {
  projectId: string;
  cardIndex: number;
  modelId: string;
  mode: ImageMode;
  size: ResolvedSize;
  requestedImages: 1;
  unitCostUsd: number;
}

export interface GenerationRequestComplete {
  falRequestId?: string;
  returnedImages: number;
  costUsd: number;
}

export interface GenerationRequestStore {
  /** 로그인 사용자에 이미 묶인 저장소다. userId 를 입력으로 받지 않는다. */
  create(row: GenerationRequestCreate): Promise<GenerationRequestCreate & { id: string }>;
  complete(id: string, patch: GenerationRequestComplete): Promise<void>;
}

export interface CardGenerationStore {
  markDone(cardIndex: number, assetPath: string): Promise<void>;
  markFailed(cardIndex: number, message: string): Promise<void>;
}

export interface FalRunResult {
  requestId?: string;
  images: Array<{ url: string }>;
}

export interface FalRunner {
  run(endpoint: string, input: Record<string, unknown>, cardIndex: number): Promise<FalRunResult>;
}

export interface CardGenerationDependencies {
  requestStore: GenerationRequestStore;
  cardStore: CardGenerationStore;
  runner: FalRunner;
  saveAsset(imageUrl: string, job: GeneratedCardJob): Promise<string>;
  saveOriginal(job: PlaceAsIsCardJob): Promise<string>;
}

export interface GeneratedCardJob {
  kind: "generated";
  projectId: string;
  cardIndex: number;
  modelId: string;
  ratioId: string;
  prompt: string;
  imageUrls: string[];
}

export interface PlaceAsIsCardJob {
  kind: "place_as_is";
  projectId: string;
  cardIndex: number;
  letterbox: LetterboxPlan;
}

export type CardGenerationJob = GeneratedCardJob | PlaceAsIsCardJob;

export interface GeneratedRequestRecord extends GenerationRequestCreate, GenerationRequestComplete {
  id: string;
}

export interface CardGenerationResult {
  cardIndex: number;
  status: "done" | "failed";
  usedAi: boolean;
  assetPath?: string;
  request?: GeneratedRequestRecord;
  error?: string;
}

export function buildModelInput(
  model: ImageModel,
  mode: ImageMode,
  resolved: ResolvedSize,
  prompt: string,
  imageUrls: string[],
): Record<string, unknown> {
  if (resolved.rejected) throw new Error(resolved.rejected);
  const input: Record<string, unknown> = {
    prompt,
    num_images: 1,
  };
  if (model.pixelSizeLimits) {
    if (!resolved.pixel) throw new Error(`${model.label} 에 보낼 image_size 가 없습니다.`);
    input.image_size = resolved.pixel;
    input.quality = "high";
  } else {
    if (!resolved.aspectRatio) throw new Error(`${model.label} 에 보낼 aspect_ratio 가 없습니다.`);
    input.aspect_ratio = resolved.aspectRatio;
    if (resolved.resolution) input.resolution = resolved.resolution;
  }
  if (mode === "i2i") input.image_urls = imageUrls;
  return input;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function failCard(
  job: CardGenerationJob,
  dependencies: CardGenerationDependencies,
  error: unknown,
  request?: GeneratedRequestRecord,
): Promise<CardGenerationResult> {
  const message = errorMessage(error);
  try {
    await dependencies.cardStore.markFailed(job.cardIndex, message);
  } catch {
    // 카드 실패 기록 자체가 실패해도 배치의 다음 카드는 계속한다.
  }
  return { cardIndex: job.cardIndex, status: "failed", usedAi: job.kind === "generated", request, error: message };
}

export async function generateCard(
  job: CardGenerationJob,
  dependencies: CardGenerationDependencies,
): Promise<CardGenerationResult> {
  if (job.kind === "place_as_is") {
    try {
      if (job.letterbox.usesAi !== false) throw new Error("원본 그대로 쓸 장은 AI 를 사용하면 안 됩니다.");
      const assetPath = await dependencies.saveOriginal(job);
      await dependencies.cardStore.markDone(job.cardIndex, assetPath);
      return { cardIndex: job.cardIndex, status: "done", usedAi: false, assetPath, request: undefined };
    } catch (error) {
      return failCard(job, dependencies, error);
    }
  }

  let confirmedRequest: GeneratedRequestRecord | undefined;
  try {
    const model = modelById(job.modelId);
    const resolved = resolveSize(job.ratioId, model);
    if (resolved.rejected) throw new Error(resolved.rejected);
    const mode: ImageMode = job.imageUrls.length > 0 ? "i2i" : "t2i";
    const endpoint = pickEndpoint(model, mode === "i2i");
    const priceSize = resolved.pixel ?? { width: 1, height: 1 };
    const unitCostUsd = unitPrice(model, mode, priceSize);
    const created = await dependencies.requestStore.create({
      projectId: job.projectId,
      cardIndex: job.cardIndex,
      modelId: job.modelId,
      mode,
      size: resolved,
      requestedImages: 1,
      unitCostUsd,
    });

    const falResult = await dependencies.runner.run(
      endpoint,
      buildModelInput(model, mode, resolved, job.prompt, job.imageUrls),
      job.cardIndex,
    );
    const completed: GenerationRequestComplete = {
      falRequestId: falResult.requestId,
      returnedImages: falResult.images.length,
      costUsd: unitCostUsd,
    };
    // fal 호출 비용은 이미 발생했다. Storage 저장보다 먼저 장부를 확정한다.
    await dependencies.requestStore.complete(created.id, completed);
    confirmedRequest = { ...created, ...completed };

    const firstImage = falResult.images[0];
    if (!firstImage) throw new Error("fal 이 이미지를 돌려주지 않았습니다.");
    const assetPath = await dependencies.saveAsset(firstImage.url, job);
    await dependencies.cardStore.markDone(job.cardIndex, assetPath);
    return {
      cardIndex: job.cardIndex,
      status: "done",
      usedAi: true,
      assetPath,
      request: confirmedRequest,
    };
  } catch (error) {
    return failCard(job, dependencies, error, confirmedRequest);
  }
}

/** 카드 하나의 실패를 결과로 닫고 다음 카드를 계속 처리한다. */
export async function generateCards(
  jobs: CardGenerationJob[],
  dependencies: CardGenerationDependencies,
): Promise<CardGenerationResult[]> {
  const results: CardGenerationResult[] = [];
  for (const job of jobs) results.push(await generateCard(job, dependencies));
  return results;
}
