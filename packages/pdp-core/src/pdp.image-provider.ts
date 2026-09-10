import { PdpServiceError } from "./pdp.service";
import type { PdpLlm } from "./pdp.llm";
import {
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

/**
 * 엔드포인트.
 *
 * Seedream·Qwen 의 경로와 파라미터는 2026-09-03 운영 fal 키로 **실제 호출해
 * 확인했다.** 문서만 보고 적으면 런타임에서야 깨지고, 그때는 사용자가 먼저
 * 만난다.
 *
 *   bytedance/seedream/v5/pro/text-to-image   200 · 약 10초
 *   bytedance/seedream/v5/pro/edit            200 · 약 95초
 *   fal-ai/qwen-image-2/pro/text-to-image     200 · 약 13초
 *   fal-ai/qwen-image-2/pro/edit              200 · 약 18초
 *
 * `fal-ai/qwen-image-2/pro` 만 부르면 404 다 — 뒤 칸이 반드시 필요하다.
 */
const ENDPOINTS: Record<ImageModelId, { textToImage: string; edit: string }> = {
  "gpt-image-2.5-flare": {
    textToImage: "openai/gpt-image-2.5/flare/text-to-image",
    edit: "openai/gpt-image-2.5/flare/edit",
  },
  "gpt-image-2": { textToImage: "openai/gpt-image-2", edit: "openai/gpt-image-2/edit" },
  "nano-banana-pro": { textToImage: "fal-ai/nano-banana-pro", edit: "fal-ai/nano-banana-pro/edit" },
  "nano-banana-2": { textToImage: "fal-ai/nano-banana-2", edit: "fal-ai/nano-banana-2/edit" },
  "nano-banana": { textToImage: "fal-ai/nano-banana", edit: "fal-ai/nano-banana/edit" },
  "seedream-5-pro": {
    textToImage: "bytedance/seedream/v5/pro/text-to-image",
    edit: "bytedance/seedream/v5/pro/edit",
  },
  "qwen-image-2-pro": {
    textToImage: "fal-ai/qwen-image-2/pro/text-to-image",
    edit: "fal-ai/qwen-image-2/pro/edit",
  },
};

/**
 * Seedream·Qwen 은 aspect_ratio 를 모른다. fal 의 preset 이름을 받는다.
 *
 * **이름이 헷갈린다** — `portrait_4_3` 이 세로 3:4 다. 앞의 낱말이 방향이고
 * 뒤의 숫자는 짧은변:긴변이다.
 */
const PRESET_SIZE: Record<AspectRatio, string> = {
  "1:1": "square_hd",
  "3:4": "portrait_4_3",
  "4:3": "landscape_4_3",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
};

/** preset 이름으로 크기를 받는 모델. */
const PRESET_MODELS: ImageModelId[] = ["seedream-5-pro", "qwen-image-2-pro"];

/**
 * GPT 계열은 화면비 대신 픽셀 크기를 받는다.
 * 제약: 16의 배수, 최대변 3840px, 비율 ≤3:1, 총 픽셀 655,360 ~ 8,294,400.
 * 아래 값들은 그 범위 안에서 각 비율에 맞춰 고른 것이다.
 *
 * **2.5 도 네 제약이 같다**(2026-09-10 실측 34회). 다만 2.5 는 어긋난 값을
 * 거부하지 않고 **조용히 보정한다** — 미리 맞춰 보내는 이 표가 그래서 더
 * 중요해졌다. 보정되면 요청한 적 없는 크기가 돌아오는데 아무도 모른다.
 */
const GPT_IMAGE_SIZE: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1536, height: 1536 },
  "3:4": { width: 1536, height: 2048 },
  "4:3": { width: 2048, height: 1536 },
  "9:16": { width: 1536, height: 2752 },
  "16:9": { width: 2752, height: 1536 },
};

/**
 * GPT 계열이 fal 에 보낼 품질. **이 표가 곧 「GPT 계열이냐」의 판별자다.**
 *
 * 따로 목록을 두면 새 GPT 모델을 넣을 때 한쪽만 고치기 쉽다. 그러면
 * `buildFalPayload` 가 GPT 분기를 지나쳐 아래 nano 분기로 떨어지고,
 * `image_size` 대신 `aspect_ratio` 가 나간다 — fal 은 200 을 돌려주고 우리는
 * 요청한 적 없는 크기의 그림을 받는다. 실패로 보이지 않는 실패다.
 *
 * 2.5 는 `max`(= `high` × 4.00) 다. 2026-09-10 실측에서 `high` 는 22초로 빠른
 * 대신 화질이 떨어졌고, `max` 가 현재 `2/high` 보다 3~7% 싸면서 2.5배 빨랐다.
 */
const GPT_QUALITY: Partial<Record<ImageModelId, string>> = {
  "gpt-image-2.5-flare": "max",
  "gpt-image-2": "high",
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

/**
 * **없어졌다.** 손으로 매긴 정수 가중치로 장을 세던 함수다.
 *
 * 같은 「1장」이 모델마다 $0.039~$0.060 로 갈렸고 크기는 담을 자리조차 없었다.
 * 이제 실제 단가에서 뽑는다 — `apps/web/lib/credit-cost.ts` 의
 * `imageCreditUnits` (2026-09-08 사용자 결정).
 */

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

  const gptQuality = GPT_QUALITY[model];
  if (gptQuality) {
    // GPT 계열에는 system_prompt 가 없다. 아트 디렉션을 프롬프트 앞에 붙인다.
    const merged = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const payload: FalPayload = {
      prompt: merged,
      image_size: GPT_IMAGE_SIZE[aspectRatio],
      quality: gptQuality,
      num_images: 1,
      output_format: "png",
    };
    if (references.length > 0) {
      payload.image_urls = withinLimit(model, references).map(toDataUri);
    }
    return payload;
  }

  if (PRESET_MODELS.includes(model)) {
    const merged = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    const preset: FalPayload = {
      prompt: merged,
      image_size: PRESET_SIZE[aspectRatio],
      num_images: 1,
    };
    if (references.length > 0) {
      preset.image_urls = withinLimit(model, references).map(toDataUri);
    }
    return preset;
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

/**
 * fal 응답에서 그림 주소를 뽑는다. **내려받지는 않는다.**
 *
 * 내려받기는 그물을 타는 일이라 `apps/web` 이 맡는다. 이 패키지는 포스터·
 * 카드뉴스 코어와 같이 순수해야 한다 — 무엇을 어디로 보낼지는 알되, 보내지는
 * 않는다.
 */
export function falImageFrom(result: unknown): { url: string; mimeType: string } {
  const image = (result as { images?: Array<{ url?: string; content_type?: string }> })?.images?.[0];
  if (!image?.url) {
    throw new PdpServiceError(
      "PDP_IMAGE_GENERATION_FAILED",
      "이미지를 생성하지 못했습니다.",
      "fal response contained no image url.",
    );
  }
  return { url: image.url, mimeType: image.content_type || "image/png" };
}

/** 이미지 한 장을 만드는 함수의 모양. 테스트에서 이 자리를 대신 채운다. */
export type ImageGenerator = (
  model: ImageModelId,
  input: ImageProviderInput,
) => Promise<GeneratedImage>;


/**
 * 상세페이지가 바깥세상과 만나는 자리 전부.
 *
 * `apps/web/lib/pdp/providers.ts` 가 만들어 넣는다. 이 패키지 안에는
 * `process.env` 도 `fetch` 도 없다 — 포스터·카드뉴스 코어와 같다.
 */
export interface PdpProviders {
  llm: PdpLlm;
  generateImage: ImageGenerator;
}
