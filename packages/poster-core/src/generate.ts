import { MATCH_SOURCE, modelById, pickEndpoint, resolvePosterSize, sizeFromSource } from "@fixup/sns-core";
import type { ImageLook } from "@fixup/shared";
import { estimatePosterCost, type PosterCostEstimate } from "./pricing";
import { buildPosterPrompt, type PosterPromptImage } from "./prompt";
import {
  attachmentUrls,
  orderFromLegacyLists,
  type OrderedAttachment,
} from "./attachment-order";
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
  /**
   * **화면에 놓인 순서 그대로**의 첨부. 이것이 프롬프트의 `Image N` 번호가 된다.
   *
   * 없으면 아래 두 목록에서 만든다 — 옛 작업에는 순서가 저장돼 있지 않다.
   */
  attachments?: OrderedAttachment[];
  /** 이미 fal 에 올려 둔 URL. `attachments` 가 없을 때만 쓴다. */
  referenceUrls: string[];
  preservedUrls: string[];
  /**
   * preservedUrls 중 사람인 것. 표시가 없으면 물건으로 다룬다 — 옛 작업에는
   * 이 값이 없고, 사람으로 보면 없는 얼굴을 지키려 든다.
   */
  personUrls?: string[];
  /**
   * 첨부한 그림의 실제 크기. 비율을 `match-source` 로 골랐을 때만 쓴다.
   *
   * 값이 없으면 그 비율을 만들 수 없다 — 무엇을 따라갈지 모르기 때문이다.
   * 부르는 쪽이 파일을 읽어 넣어 준다.
   */
  sourceSize?: { width: number; height: number };
  /** 사용자가 직접 친 추가 지시. 프롬프트의 양끝으로 간다. */
  userInstruction?: string;
  /** 첨부한 그림들을 어떻게 쓸지. 01에서 적는다. */
  attachmentIntent?: string;
  /** 그림의 결. 없으면 auto — 첨부한 그림의 결을 따라간다. */
  look?: ImageLook;
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

  /**
   * 화면 순서 하나로 통일한다.
   *
   * 전에는 여기서 따라 만들 것을 먼저 이어 붙였다. 그래서 화면 왼쪽의 「인물
   * 지키기」가 프롬프트에서 `Image 2` 가 됐다 — 사용자가 「①번을」이라고 쓰면
   * 반대로 알아들었다.
   */
  const attachments = job.attachments?.length
    ? job.attachments
    // **`??` 를 쓰면 안 된다.** 저장된 차례를 복원하는 쪽은 차례가 없는 옛
    // 작업에 빈 배열을 준다. `[] ?? legacy` 는 `[]` 라서 첨부를 통째로 잃는다 —
    // 프롬프트에 Image 줄이 없고 fal 에 URL 도 안 간다(2026-09-07 리뷰).
    : orderFromLegacyLists(job.referenceUrls, job.preservedUrls, job.personUrls ?? []);

  const images: PosterPromptImage[] = attachments.map((attachment): PosterPromptImage =>
    attachment.role === "style"
      ? { kind: "style_reference" }
      : {
        kind: "preserved",
        subject: attachment.role === "preserve_person" ? "person" : "object",
      });

  if (estimate.rejected) {
    return {
      endpoint: "", mode: estimate.mode, prompt: "", input: {}, estimate, size: {},
      rejected: estimate.rejected,
    };
  }

  const model = modelById(job.modelId);

  // 모델이 받을 수 있는 장수를 넘으면 여기서 멈춘다.
  //
  // 조용히 자르지 않는다. 뒤쪽을 버리면 지키려던 제품이 사라진 채로 그림이
  // 나오고, 사용자는 왜 안 들어갔는지 알 수 없다. 만들기 전에 말한다.
  const referenceCount = job.referenceUrls.length + job.preservedUrls.length;
  if (referenceCount > model.maxReferenceImages) {
    return {
      endpoint: "", mode: estimate.mode, prompt: "", input: {}, estimate, size: {},
      rejected:
        `${model.label} 은 참고 이미지를 ${model.maxReferenceImages}장까지 받습니다. ` +
        `지금 ${referenceCount}장입니다 — 빼거나 다른 모델을 고르세요.`,
    };
  }
  // 첨부한 그림을 따라가는 비율은 그때그때 크기가 다르다. 목록에 적힌 픽셀이
  // 아니라 실제 그림에서 뽑는다.
  const resolved = job.ratioId === MATCH_SOURCE
    ? (job.sourceSize
      ? sizeFromSource(job.sourceSize, model)
      : { mode: "pixel" as const, rejected: "첨부한 그림의 크기를 읽지 못해 같은 비율로 만들 수 없습니다." })
    : resolvePosterSize(job.ratioId, model);
  if (resolved.rejected) {
    return {
      endpoint: "", mode: estimate.mode, prompt: "", input: {}, estimate, size: {},
      rejected: resolved.rejected,
    };
  }
  const size = resolved.pixel
    ? { width: resolved.pixel.width, height: resolved.pixel.height }
    : { aspectRatio: resolved.aspectRatio, resolution: resolved.resolution };
  const prompt = buildPosterPrompt({
    slots: job.slots,
    images,
    size: resolved.pixel,
    userInstruction: job.userInstruction,
    attachmentIntent: job.attachmentIntent,
    look: job.look,
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
  // 프롬프트와 같은 배열에서 뽑는다. 둘이 갈리면 「Image 2」라고 적힌 지시가
  // 다른 그림에 붙는다.
  const imageUrls = attachmentUrls(attachments);
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
  /**
   * 목록에 거는 사본의 경로. 못 만든 장은 `null` 이다.
   *
   * 안 주면 전부 비어 있는 것으로 친다 — 사본이 없던 시절의 흐름이 그대로
   * 동작해야 한다.
   */
  thumbPaths?: Array<string | null>;
}

export function posterImageRows(
  input: PosterResultInput,
): Array<Omit<PosterImageRecord, "id" | "createdAt" | "selected">> {
  if (input.paths.length !== input.images.length) {
    throw new Error(
      `저장한 경로 ${input.paths.length}개와 받은 이미지 ${input.images.length}장이 다릅니다.`,
    );
  }
  // **어긋나면 거부한다.** 사본 자리가 한 칸 밀리면 목록에 남의 그림이 뜬다.
  if (input.thumbPaths && input.thumbPaths.length !== input.images.length) {
    throw new Error(
      `사본 경로 ${input.thumbPaths.length}개와 받은 이미지 ${input.images.length}장이 다릅니다.`,
    );
  }
  return input.images.map((image, index) => ({
    projectId: input.projectId,
    generationRequestId: input.generationRequestId,
    variantIndex: index,
    assetPath: input.paths[index]!,
    thumbPath: input.thumbPaths?.[index] ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    review: null,
  }));
}
