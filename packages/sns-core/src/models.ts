export type ImageMode = "t2i" | "i2i";

export interface PixelSize { width: number; height: number }

export interface PriceRow { width: number; height: number; usd: number }

export interface ModeSpec {
  endpoint: string;
  /** 고정 단가 모델. nano 계열. */
  flatUsd?: number;
  /** 크기별 표. GPT Image 2. high 품질 기준. */
  table?: PriceRow[];
}

export interface ImageModel {
  id: string;
  label: string;
  isDefault?: boolean;
  t2i: ModeSpec;
  i2i: ModeSpec;
  maxReferenceImages: number;
  batchMax: number;
  /** 열거로 비율을 받는 모델. 픽셀 지정 모델은 비운다. */
  supportedRatios?: string[];
  /** 픽셀을 직접 지정하는 모델의 제약. */
  pixelSizeLimits?: { minPixels: number; maxPixels: number; maxEdge: number; multipleOf: number; maxAspect: number };
  /** nano 계열이 쓰는 고정 해상도. 사용자에게 노출하지 않는다. */
  fixedResolution?: "0.5K" | "1K" | "2K" | "4K";
  /** 고정 해상도에 곱할 배수. */
  resolutionMultiplier?: number;
}

/** fal 모델 페이지 공표값 (2026-08-31 확인). high 품질 기준. */
const GPT_T2I: PriceRow[] = [
  { width: 1024, height: 768, usd: 0.145 },
  { width: 1024, height: 1024, usd: 0.211 },
  { width: 1024, height: 1536, usd: 0.165 },
  { width: 1920, height: 1080, usd: 0.158 },
  { width: 2560, height: 1440, usd: 0.222 },
  { width: 3840, height: 2160, usd: 0.401 },
];

const GPT_I2I: PriceRow[] = [
  { width: 1024, height: 768, usd: 0.151 },
  { width: 1024, height: 1024, usd: 0.219 },
  { width: 1024, height: 1536, usd: 0.178 },
  { width: 1920, height: 1080, usd: 0.158 },
  { width: 2560, height: 1440, usd: 0.234 },
  { width: 3840, height: 2160, usd: 0.413 },
];

const NANO_RATIOS_15 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16","4:1","1:4","8:1","1:8"];
const NANO_RATIOS_11 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16"];

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    isDefault: true,
    t2i: { endpoint: "openai/gpt-image-2", table: GPT_T2I },
    i2i: { endpoint: "openai/gpt-image-2/edit", table: GPT_I2I },
    maxReferenceImages: 16,
    batchMax: 4,
    pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 },
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    t2i: { endpoint: "fal-ai/nano-banana-pro", flatUsd: 0.15 },
    i2i: { endpoint: "fal-ai/nano-banana-pro/edit", flatUsd: 0.15 },
    maxReferenceImages: 14,
    batchMax: 4,
    supportedRatios: NANO_RATIOS_11,
    fixedResolution: "2K",
    resolutionMultiplier: 1,
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    t2i: { endpoint: "fal-ai/nano-banana-2", flatUsd: 0.08 },
    i2i: { endpoint: "fal-ai/nano-banana-2/edit", flatUsd: 0.08 },
    maxReferenceImages: 14,
    batchMax: 4,
    supportedRatios: NANO_RATIOS_15,
    fixedResolution: "2K",
    resolutionMultiplier: 1.5,
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    t2i: { endpoint: "fal-ai/nano-banana", flatUsd: 0.039 },
    i2i: { endpoint: "fal-ai/nano-banana/edit", flatUsd: 0.039 },
    maxReferenceImages: 7,
    batchMax: 1,
    supportedRatios: NANO_RATIOS_11,
  },
];

export function modelById(id: string): ImageModel {
  const found = IMAGE_MODELS.find((model) => model.id === id);
  if (!found) throw new Error(`모르는 모델입니다: ${id}`);
  return found;
}

/**
 * 어느 엔드포인트로 부를지.
 *
 * 사용자에게 묻지 않는다. 레퍼런스가 있으면 편집이고 없으면 생성이다.
 */
export function pickEndpoint(model: ImageModel, hasReferences: boolean): string {
  return hasReferences ? model.i2i.endpoint : model.t2i.endpoint;
}

/**
 * 표에서 요청 크기에 맞는 행을 고른다.
 *
 * 픽셀 수로 고르면 틀린다. 이 표는 픽셀에 비례하지 않는다 — 정사각형이 비싸다.
 * 가로세로비가 가장 가까운 행을 먼저 보고, 같으면 픽셀이 가까운 쪽을 쓴다.
 */
function pickRow(table: PriceRow[], size: PixelSize): PriceRow {
  const aspect = size.width / size.height;
  const pixels = size.width * size.height;
  return [...table].sort((first, second) => {
    const firstAspect = Math.abs(first.width / first.height - aspect);
    const secondAspect = Math.abs(second.width / second.height - aspect);
    if (Math.abs(firstAspect - secondAspect) > 0.05) return firstAspect - secondAspect;
    return Math.abs(first.width * first.height - pixels) - Math.abs(second.width * second.height - pixels);
  })[0]!;
}

/** 장당 단가. fal 이 공표한 값으로 계산한다. */
export function unitPrice(model: ImageModel, mode: ImageMode, size: PixelSize): number {
  const spec = mode === "i2i" ? model.i2i : model.t2i;
  if (spec.flatUsd !== undefined) {
    return Number((spec.flatUsd * (model.resolutionMultiplier ?? 1)).toFixed(4));
  }
  if (!spec.table) throw new Error(`${model.id} 에 단가 정보가 없습니다.`);
  return pickRow(spec.table, size).usd;
}
