import { IMAGE_MODELS, priceCoverage, resolvePosterSize, type ImageMode } from "@fixup/sns-core";

/**
 * 포스터 비용 추정.
 *
 * fal 견적 API 를 부르지 않는다. 공표 가격표로 계산한다 — 사용자 결정이고,
 * 카드뉴스에서 두 번 실측해 예측과 실제 청구가 일치했다.
 *
 * 카드뉴스와 다른 점은 **변형 장수** 다. 카드뉴스는 카드마다 1장을 만들고 1장을
 * 저장하지만, 포스터는 한 요청에서 1~3장을 받아 **전부 저장한다.** 그래서 낸 만큼
 * 다 쓰고, 비용도 장수만큼 곱한다.
 */

export const MIN_VARIANTS = 1;
export const MAX_VARIANTS = 3;

/**
 * 화면을 열었을 때 몇 장으로 시작하나.
 *
 * **1장이다**(2026-09-08 사용자 결정). 3장으로 시작하고 있었다 — 한 장만 보려던
 * 사람도 세 배를 내고, 그것도 **누르기 전에는 모른다.**
 *
 * 더 필요하면 그 자리에서 올리면 된다. 기본값은 **되돌릴 수 없는 쪽이 아니라
 * 싼 쪽**에 둔다 — 세 장이 필요한 사람은 한 번 더 누르면 되지만, 한 장이면 됐던
 * 사람은 이미 나간 돈을 못 돌려받는다.
 *
 * `MIN_VARIANTS` 와 같은 값이지만 **뜻이 다르다.** 하한은 「이보다 적게는 못
 * 만든다」이고 이것은 「안 고르면 이것」이다. 하한이 바뀌어도 기본값은 그대로일
 * 수 있으므로 한 이름으로 합치지 않는다.
 */
export const DEFAULT_VARIANTS = 1;

export interface PosterCostInput {
  modelId: string;
  ratioId: string;
  variants: number;
  hasReferences: boolean;
}

export interface PosterCostEstimate {
  mode: ImageMode;
  variants: number;
  unitUsd?: number;
  totalUsd?: number;
  /**
   * 공표 가격표에 없는 크기라 가장 비싼 값으로 잡았다.
   * 실제 청구는 생성 뒤 장부에 기록된 값이 정확하다.
   */
  approximate?: true;
  /** 값을 낼 수 없는 이유. 있으면 금액 칸은 비어 있다. */
  rejected?: string;
}

export function estimatePosterCost(input: PosterCostInput): PosterCostEstimate {
  const mode: ImageMode = input.hasReferences ? "i2i" : "t2i";
  const base = { mode, variants: input.variants };

  if (!Number.isInteger(input.variants)
    || input.variants < MIN_VARIANTS
    || input.variants > MAX_VARIANTS) {
    return { ...base, rejected: `변형은 ${MIN_VARIANTS}~${MAX_VARIANTS}장까지 만들 수 있습니다.` };
  }

  const model = IMAGE_MODELS.find((entry) => entry.id === input.modelId);
  if (!model) return { ...base, rejected: `모르는 모델입니다: ${input.modelId}` };

  const resolved = resolvePosterSize(input.ratioId, model);
  if (resolved.rejected) return { ...base, rejected: resolved.rejected };

  // 열거 모델은 픽셀이 단가에 영향을 주지 않는다(고정 단가). 그래도 표 조회에는
  // 크기가 필요하므로 비율의 픽셀을 그대로 넘긴다.
  const size = resolved.pixel ?? sizeOf(input.ratioId);
  if (!size) return { ...base, rejected: `${input.ratioId} 의 크기를 찾지 못했습니다.` };

  const { covered, usd } = priceCoverage(model, mode, size);
  return {
    ...base,
    unitUsd: usd,
    totalUsd: Number((usd * input.variants).toFixed(4)),
    // 표에 없는 크기다. 적게 잡는 쪽이 위험해 가장 비싼 값을 썼다.
    ...(covered ? {} : { approximate: true }),
  };
}

function sizeOf(ratioId: string): { width: number; height: number } | undefined {
  const gpt = IMAGE_MODELS.find((model) => model.pixelSizeLimits);
  if (!gpt) return undefined;
  return resolvePosterSize(ratioId, gpt).pixel;
}
