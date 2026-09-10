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
  /**
   * 회원에게 보이는 이름. **우리가 붙인 이름이지 모델 이름이 아니다.**
   * 진짜 정체는 `id` 다 — 서버에 보낼 값이라 지울 수 없다.
   * 이유는 `pdp-core/types.ts` 의 같은 자리에 적어 두었다.
   */
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
  /**
   * fal 에 보낼 품질. **모델 속성이지 호출자 인자가 아니다.**
   *
   * 크레딧이 단가표에서 나온다(`unitPrice` → `estimateCost` → `creditUnits` →
   * `reserveAiUsage`). 품질을 호출자가 넘기게 하면 같은 모델·같은 크기에서 값이
   * 4배 달라지는데 표는 하나다. 그러면 `unitPrice`·`priceCoverage`·
   * `estimateSlots`·`deckEstimate`·`estimateCost`·`poster-core/pricing`·
   * `credit-cost` 여덟 자리의 시그니처를 다 고쳐야 하고, **한 곳만 빠져도 그
   * 경로가 조용히 틀린 값으로 차감한다.**
   *
   * 여기 두면 「이 모델의 표 = 이 품질의 값」이 한 객체 안에서 깨질 수 없다.
   * 비우면 `high` 다 — 옛 모델들이 그렇게 돌고 있었다.
   */
  quality?: "low" | "medium" | "high" | "xhigh" | "max";
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

/**
 * gpt-image-2.5 의 `max` 품질 단가.
 *
 * **1088×1360(→ `1024×1536` 행)만 실측했다**(2026-09-10, fal 실호출).
 * 나머지 다섯 행은 fal 모델 페이지의 표를 그대로 옮겼고, 그 표에서 모든
 * 크기가 `max = high × 4.00` 으로 일정한 것을 확인했다.
 *
 * **t2i 와 i2i 가 같다.** gpt-image-2 는 편집이 3~4% 비쌌는데 2.5 는 같은 값이다.
 * 그래서 표를 하나만 둔다.
 */
const GPT25_MAX: PriceRow[] = [
  { width: 1024, height: 768, usd: 0.14445 },
  { width: 1024, height: 1024, usd: 0.21072 },
  { width: 1024, height: 1536, usd: 0.16464 },
  { width: 1920, height: 1080, usd: 0.15840 },
  { width: 2560, height: 1440, usd: 0.22110 },
  { width: 3840, height: 2160, usd: 0.40026 },
];

const NANO_RATIOS_15 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16","4:1","1:4","8:1","1:8"];
const NANO_RATIOS_11 = ["auto","21:9","16:9","3:2","4:3","5:4","1:1","4:5","3:4","2:3","9:16"];

/**
 * **차례가 뜻을 갖는다.** 세 곳이 배열 순서를 본다 —
 * `poster-core/pricing.ts` 가 첫 픽셀 모델로 크기를 계산하고,
 * `create/ModelPicker.tsx` 가 첫 항목에 「기본」 배지를 붙이고,
 * `layout-core/image-request.ts` 의 `planSlotImage` 가 동점일 때 앞을 고른다.
 * flare 와 gpt-image-2 는 픽셀 한계가 같아 **항상 동점**이므로, 새 기본을
 * 맨 앞에 둔다.
 */
export const IMAGE_MODELS: ImageModel[] = [
  {
    /**
     * 기본. **빠르고 값이 싸다** — 2026-09-10 실측에서 현재 모델의 1/2.5 시간에
     * 3~7% 싼 값으로 같은 크기·안 깨진 한글을 냈다.
     *
     * **`max` 를 쓴다.** 2.5 는 품질 단계가 다섯이고 `high` 는 값으로 보면 옛
     * `medium` 자리다. 지금 화질을 지키려면 `max` 여야 하고, 그래도 현재보다
     * 싸다.
     */
    id: "gpt-image-2.5-flare",
    label: "표준형",
    isDefault: true,
    quality: "max",
    t2i: { endpoint: "openai/gpt-image-2.5/flare/text-to-image", table: GPT25_MAX },
    i2i: { endpoint: "openai/gpt-image-2.5/flare/edit", table: GPT25_MAX },
    maxReferenceImages: 16,
    batchMax: 4,
    pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 },
  },
  {
    /**
     * 정밀. **느린 대신 지시를 더 잘 지킨다.**
     *
     * 2026-09-10 실측에서 배치 지시(`image-prompt.ts:352`)를 2회 모두 지킨
     * 유일한 모델이다. 대신 95초로 현재 모델과 비슷하게 느리다 — 카드 여덟
     * 장이면 13분이다.
     *
     * **기본으로 안 둔다.** 표본이 2개뿐이라 배치 준수를 단정할 수 없고,
     * 화질 등급이 flare 와 같은데(둘 다 `max`) 속도가 2배 차이다.
     *
     * **상세페이지·캐릭터에는 안 낸다.** 그 둘은 동기로 돌고 상한이 300초인데
     * (`pdp/images/batch/route.ts`), 95초 × 3장이면 285초다.
     */
    id: "gpt-image-2.5-sunburst",
    label: "정밀형 플러스",
    quality: "max",
    t2i: { endpoint: "openai/gpt-image-2.5/sunburst/text-to-image", table: GPT25_MAX },
    i2i: { endpoint: "openai/gpt-image-2.5/sunburst/edit", table: GPT25_MAX },
    maxReferenceImages: 16,
    batchMax: 4,
    pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 },
  },
  {
    /**
     * **지우지 않는다.** 저장된 작업이 이 id 를 들고 있고 `modelById` 가 모르는
     * id 에 던진다 — 지우면 그 작업들이 500 이 된다.
     */
    id: "gpt-image-2",
    label: "정밀형",
    t2i: { endpoint: "openai/gpt-image-2", table: GPT_T2I },
    i2i: { endpoint: "openai/gpt-image-2/edit", table: GPT_I2I },
    maxReferenceImages: 16,
    batchMax: 4,
    pixelSizeLimits: { minPixels: 655360, maxPixels: 8294400, maxEdge: 3840, multipleOf: 16, maxAspect: 3 },
  },
  {
    id: "nano-banana-pro",
    label: "속도형",
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
    label: "속도형 라이트",
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
    label: "경제형",
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

/**
 * 표가 이 크기를 덮는가.
 *
 * 가격표에는 여섯 크기뿐이다. 요청 크기가 고른 행보다 훨씬 크면 비율만 비슷할 뿐
 * 값이 맞을 리 없다 — A4 인쇄용(814만 픽셀)이 1024×1536(157만) 행에 붙어
 * 5배 큰 이미지를 같은 값으로 계산하는 일이 실제로 있었다.
 *
 * 덮지 못하면 **표에서 가장 비싼 값**을 쓴다. 적게 잡는 쪽이 위험하다.
 */
export function priceCoverage(
  model: ImageModel,
  mode: ImageMode,
  size: PixelSize,
): { covered: boolean; usd: number } {
  const spec = mode === "i2i" ? model.i2i : model.t2i;
  if (spec.flatUsd !== undefined || !spec.table) {
    return { covered: true, usd: unitPrice(model, mode, size) };
  }
  const row = pickRow(spec.table, size);
  const requested = size.width * size.height;
  const matched = row.width * row.height;
  if (requested <= matched * 2) return { covered: true, usd: row.usd };
  return { covered: false, usd: Math.max(...spec.table.map((entry) => entry.usd)) };
}
