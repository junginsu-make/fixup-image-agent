import { modelById, pickEndpoint, resolvePosterSize } from "@fixup/sns-core";
import { estimatePosterCost, type PosterCostEstimate } from "./pricing";
import { buildPosterPrompt, type PosterPromptImage } from "./prompt";
import type { PosterSlots } from "./schemas";
import type { PosterImageRecord } from "./store";

/**
 * fal 한 번 부르는 데 필요한 것을 조립한다.
 *
 * **카드뉴스와 다른 점은 장수다.** 카드뉴스는 카드마다 1장을 만들고 1장을
 * 저장한다. 포스터는 한 요청에서 1~3장을 받아 **전부 저장한다.** 그래서
 * `num_images` 를 변형 수만큼 요청하고 비용도 그만큼 낸다.
 *
 * 과금은 이미지가 아니라 **요청**에 붙는다. 요청 1행 + 이미지 N행이다.
 * 이미지마다 비용을 적으면 합계가 N배로 부풀어 오른다.
 */

export interface PosterJobInput {
  projectId: string;
  modelId: string;
  ratioId: string;
  variants: number;
  slots: PosterSlots;
  /** 이미 fal 에 올려 둔 URL. 순서가 프롬프트의 Image 번호와 같아야 한다. */
  referenceUrls: string[];
  preservedUrls: string[];
}

export interface PosterJob {
  endpoint: string;
  mode: "t2i" | "i2i";
  prompt: string;
  input: Record<string, unknown>;
  estimate: PosterCostEstimate;
  size: { width?: number; height?: number; aspectRatio?: string; resolution?: string };
  rejected?: string;
}

export function buildPosterJob(job: PosterJobInput): PosterJob {
  const hasReferences = job.referenceUrls.length + job.preservedUrls.length > 0;
  const estimate = estimatePosterCost({
    modelId: job.modelId,
    ratioId: job.ratioId,
    variants: job.variants,
    hasReferences,
  });

  const images: PosterPromptImage[] = [
    ...job.referenceUrls.map((): PosterPromptImage => ({ kind: "style_reference" })),
    ...job.preservedUrls.map((): PosterPromptImage => ({ kind: "preserved" })),
  ];

  if (estimate.rejected) {
    return {
      endpoint: "", mode: estimate.mode, prompt: "", input: {}, estimate, size: {},
      rejected: estimate.rejected,
    };
  }

  const model = modelById(job.modelId);
  const resolved = resolvePosterSize(job.ratioId, model);
  const size = resolved.pixel
    ? { width: resolved.pixel.width, height: resolved.pixel.height }
    : { aspectRatio: resolved.aspectRatio, resolution: resolved.resolution };
  const prompt = buildPosterPrompt({
    slots: job.slots,
    images,
    size: resolved.pixel ?? { width: 0, height: 0 },
  });

  const input: Record<string, unknown> = { prompt, num_images: job.variants };
  if (resolved.pixel) {
    // 기본값 auto 는 입력 이미지 크기를 물려받는다. 반드시 명시한다.
    input.image_size = resolved.pixel;
    input.quality = "high";
  } else {
    input.aspect_ratio = resolved.aspectRatio;
    if (resolved.resolution) input.resolution = resolved.resolution;
  }
  // 순서가 프롬프트의 Image 번호와 같아야 한다. 레퍼런스 먼저, 보존 대상 나중.
  const imageUrls = [...job.referenceUrls, ...job.preservedUrls];
  if (imageUrls.length) input.image_urls = imageUrls;

  return {
    endpoint: pickEndpoint(model, hasReferences),
    mode: estimate.mode,
    prompt,
    input,
    estimate,
    size,
  };
}

export interface PosterResultInput {
  projectId: string;
  generationRequestId: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  /** 이미 저장을 마친 경로. 이미지와 같은 순서·같은 개수여야 한다. */
  paths: string[];
}

export function posterImageRows(
  input: PosterResultInput,
): Array<Omit<PosterImageRecord, "id" | "createdAt" | "selected">> {
  if (input.paths.length !== input.images.length) {
    throw new Error(
      `저장한 경로 ${input.paths.length}개와 받은 이미지 ${input.images.length}장이 다릅니다.`,
    );
  }
  return input.images.map((image, index) => ({
    projectId: input.projectId,
    generationRequestId: input.generationRequestId,
    variantIndex: index,
    assetPath: input.paths[index]!,
    width: image.width ?? null,
    height: image.height ?? null,
    review: null,
  }));
}
