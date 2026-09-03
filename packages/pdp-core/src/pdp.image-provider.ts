import { PdpServiceError } from "./pdp.service";
import {
  IMAGE_MODEL_CREDIT_WEIGHT,
  IMAGE_MODELS,
  type AspectRatio,
  type ImageModelId,
  type ReferenceImage,
} from "./types";

/**
 * 이미지 생성 제공자. fal.ai 를 경유하고 모델 세 가지를 지원한다.
 *
 * 세 모델의 입력 규격이 서로 다르다. 이 파일이 그 차이를 흡수해서
 * 호출부(pdp.service.ts)는 모델을 신경 쓰지 않게 한다.
 *
 * 규격은 fal 공식 문서(2026-07-27 확인)를 그대로 옮긴 것이다.
 * 자세한 근거는 docs/superpowers/specs/2026-07-27-fal-image-provider-design.md 참조.
 */

const FAL_BASE_URL = "https://fal.run";

/**
 * 그 모델이 받을 수 있는 만큼만 보낸다.
 *
 * 전에는 GPT 만 16장으로 잘랐고 nano 계열은 받은 만큼 다 보냈다. nano 는
 * 14장(pro)·7장(기본)까지인데 넘겨 보내면 fal 이 거절하거나 뒤쪽을 조용히
 * 버린다 — 어느 쪽이든 사용자는 붙인 그림이 왜 반영이 안 됐는지 모른다.
 *
 * **앞쪽을 남긴다.** 순서가 곧 우선순위라, 정체성 기준이 앞에 온다.
 */
function withinLimit(model: ImageModelId, references: ReferenceImage[]) {
  const limit = IMAGE_MODELS.find((entry) => entry.id === model)?.maxReferenceImages;
  // 모르는 모델이면 가장 좁은 상한으로 떨어뜨린다. 크게 잡아 틀리면 요청이 죽는다.
  return references.slice(0, limit ?? 7);
}

const ENDPOINTS: Record<ImageModelId, { textToImage: string; edit: string }> = {
  "gpt-image-2": { textToImage: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
  "nano-banana-pro": { textToImage: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit" },
  "nano-banana": { textToImage: "fal-ai/nano-banana", edit: "fal-ai/nano-banana/edit" },
};

/**
 * GPT Image 2 는 화면비 대신 픽셀 크기를 받는다.
 * 제약: 16의 배수, 최대변 3840px, 비율 ≤3:1, 총 픽셀 655,360 ~ 8,294,400.
 * 아래 값들은 그 범위 안에서 각 비율에 맞춰 고른 것이다.
 */
const GPT_IMAGE_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1536, height: 1536 },
  "3:4": { width: 1536, height: 2048 },
  "4:3": { width: 2048, height: 1536 },
  "9:16": { width: 1536, height: 2752 },
  "16:9": { width: 2752, height: 1536 },
};

export type FalPayload = Record<string, unknown>;

export interface ImageProviderInput {
  prompt: string;
  systemPrompt: string;
  aspectRatio: AspectRatio;
  references: ReferenceImage[];
}

export function resolveEndpoint(model: ImageModelId, references: ReferenceImage[]) {
  const entry = ENDPOINTS[model];
  return references.length > 0 ? entry.edit : entry.textToImage;
}

export function creditUnitsFor(model: ImageModelId, imageCount: number) {
  return IMAGE_MODEL_CREDIT_WEIGHT[model] * imageCount;
}

/** 모델별로 한 요청에 묶을 수 있는 최대 장수. */
export function maxBatchSizeFor(model: ImageModelId) {
  // 모르는 값이 들어오면 가장 느린 모델 기준으로 떨어뜨린다.
  // 큰 쪽으로 틀리면 함수가 300초에 걸려 죽는다.
  return IMAGE_MODELS.find((entry) => entry.id === model)?.maxBatchSize ?? 3;
}

/**
 * 생성 대상을 모델이 감당할 수 있는 묶음으로 나눈다.
 * 순서와 개수는 그대로 유지한다 — 섹션 순서가 곧 페이지 순서다.
 */
export function chunkForModel<T>(items: readonly T[], model: ImageModelId): T[][] {
  const size = maxBatchSizeFor(model);
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toDataUri(reference: ReferenceImage) {
  return `data:${reference.mimeType};base64,${reference.base64}`;
}

export function buildFalPayload(model: ImageModelId, input: ImageProviderInput): FalPayload {
  const { prompt, systemPrompt, aspectRatio, references } = input;

  if (model === "gpt-image-2") {
    // GPT 계열에는 system_prompt 가 없다. 아트 디렉션을 프롬프트 앞에 붙인다.
    const merged = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const payload: FalPayload = {
      prompt: merged,
      image_size: GPT_IMAGE_SIZE[aspectRatio],
      quality: "high",
      num_images: 1,
      output_format: "png",
    };
    if (references.length > 0) {
      payload.image_urls = withinLimit(model, references).map(toDataUri);
    }
    return payload;
  }

  const payload: FalPayload = {
    prompt,
    aspect_ratio: aspectRatio,
    num_images: 1,
    output_format: "png",
  };

  if (model === "nano-banana-pro") {
    // 아트 디렉션을 시스템 쪽으로 빼면 프롬프트가 짧아져 실측에서 시간이 40% 줄었다.
    payload.resolution = "2K";
    if (systemPrompt) payload.system_prompt = systemPrompt;
  }

  if (references.length > 0) {
    payload.image_urls = withinLimit(model, references).map(toDataUri);
  }

  return payload;
}

export interface GeneratedImage {
  base64: string;
  mimeType: string;
}

/** 테스트에서 fal 호출을 대신 끼워 넣기 위한 통로. */
export type FalFetch = (endpoint: string, payload: FalPayload) => Promise<unknown>;

async function callFal(endpoint: string, payload: FalPayload): Promise<unknown> {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new PdpServiceError(
      "GEMINI_API_KEY_MISSING",
      "이미지 생성 키가 설정되지 않았습니다.",
      "FAL_KEY is not configured.",
    );
  }

  const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new PdpServiceError(
      response.status === 429 ? "GEMINI_QUOTA_EXCEEDED" : "PDP_IMAGE_GENERATION_FAILED",
      response.status === 429
        ? "이미지 생성 요청이 몰렸습니다. 잠시 후 다시 시도해 주세요."
        : "이미지를 생성하지 못했습니다.",
      `fal ${endpoint} responded ${response.status}: ${text.slice(0, 300)}`,
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PdpServiceError(
      "GEMINI_RESPONSE_INVALID",
      "이미지 생성 응답을 해석하지 못했습니다.",
      "fal response was not valid JSON.",
    );
  }
}

export async function extractFalImage(result: unknown): Promise<GeneratedImage> {
  const url = (result as { images?: Array<{ url?: string; content_type?: string }> })?.images?.[0];
  if (!url?.url) {
    throw new PdpServiceError(
      "PDP_IMAGE_GENERATION_FAILED",
      "이미지를 생성하지 못했습니다.",
      "fal response contained no image url.",
    );
  }

  // fal 은 호스팅 URL 로 돌려준다. 파이프라인이 base64 를 쓰므로 여기서 받아 변환한다.
  const response = await fetch(url.url);
  if (!response.ok) {
    throw new PdpServiceError(
      "PDP_IMAGE_GENERATION_FAILED",
      "생성한 이미지를 내려받지 못했습니다.",
      `image download responded ${response.status}`,
    );
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: url.content_type || "image/png" };
}

/** 이미지 한 장을 만드는 함수의 모양. 테스트에서 이 자리를 대신 채운다. */
export type ImageGenerator = (
  model: ImageModelId,
  input: ImageProviderInput,
) => Promise<GeneratedImage>;

/** 모델 하나로 이미지 한 장을 만든다. */
export async function generateImageViaFal(
  model: ImageModelId,
  input: ImageProviderInput,
  falFetch: FalFetch = callFal,
): Promise<GeneratedImage> {
  const endpoint = resolveEndpoint(model, input.references);
  const payload = buildFalPayload(model, input);
  return extractFalImage(await falFetch(endpoint, payload));
}
