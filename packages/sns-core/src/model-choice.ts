import type { ImageModel, PixelSize } from "./models";
import { POSTER_RATIOS, type ResolvedSize } from "./ratios";

/**
 * 비율이 모델보다 우선한다.
 *
 * 모델마다 만들 수 있는 비율이 다르다. GPT Image 2 는 픽셀을 직접 받아
 * 거의 아무 비율이나 되고, nano 계열은 정해진 목록에서만 고른다
 * (`fal.ai` 모델 문서, 2026-09-03 재확인).
 *
 *   nano-banana / nano-banana-pro   11가지
 *   nano-banana-2                   위 11 + 4:1 · 1:4 · 8:1 · 1:8
 *   gpt-image-2                     픽셀 지정 (16의 배수, 최대 3840, 비율 3:1 이내)
 *
 * 전에는 사용자가 고른 모델이 그 비율을 못 만들면 그냥 거절했다. 사용자는
 * 왜 안 되는지, 무엇을 바꿔야 하는지 알기 어렵다. **원하는 모양이 먼저이고
 * 모델은 그것을 만들 수 있는 것으로 고르면 된다.**
 *
 * 다만 조용히 바꾸지는 않는다. 바꾼 이유를 함께 돌려줘서 화면이 말하게 한다 —
 * 모델마다 값이 다르고 결과의 결도 다르다.
 */

/** 첨부한 그림·레퍼런스와 같은 비율로 만든다는 뜻. */
export const MATCH_SOURCE = "match-source";

export interface ModelChoice {
  model: ImageModel;
  /** 사용자가 고른 것과 다른 모델을 골랐나. */
  switched: boolean;
  /** 왜 바꿨는지. 안 바꿨으면 비어 있다. */
  reason?: string;
}

/** `auto` 는 값이 아니라 "알아서" 라는 뜻이라 비교 대상이 아니다. */
function ratioValue(id: string): number | null {
  const [width, height] = id.split(":").map(Number);
  return width && height ? width / height : null;
}

/** 열거로만 받는 모델에서, 원본에 가장 가까운 비율. */
export function nearestEnumRatio(source: PixelSize, supported: string[]): string | undefined {
  const target = source.width / source.height;
  return supported
    .flatMap((id) => {
      const value = ratioValue(id);
      return value ? [{ id, gap: Math.abs(value - target) }] : [];
    })
    .sort((first, second) => first.gap - second.gap)[0]?.id;
}

/**
 * 첨부한 그림과 같은 비율의 픽셀 크기.
 *
 * 그대로 쓸 수는 없다. 모델이 16의 배수만 받고, 너무 작거나 큰 것도 거부한다.
 * 비율은 지키면서 한계 안으로 옮긴다.
 */
export function sizeFromSource(source: PixelSize, model: ImageModel): ResolvedSize {
  const limits = model.pixelSizeLimits;
  if (!limits) {
    return { mode: "enum", rejected: `${model.label} 은 첨부한 비율을 그대로 쓸 수 없습니다.` };
  }

  const aspect = source.width / source.height;
  if (aspect > limits.maxAspect || 1 / aspect > limits.maxAspect) {
    return {
      mode: "pixel",
      rejected: `첨부한 그림의 비율이 ${limits.maxAspect}:1 을 넘습니다. 이 비율로는 만들 수 없습니다.`,
    };
  }

  // 먼저 한계 안으로 옮긴다. 아직 소수점이 남아 있다.
  let width = source.width;
  let height = source.height;

  const shrink = Math.min(
    1,
    limits.maxEdge / Math.max(width, height),
    Math.sqrt(limits.maxPixels / (width * height)),
  );
  width *= shrink;
  height *= shrink;

  const grow = Math.max(1, Math.sqrt(limits.minPixels / (width * height)));
  width *= grow;
  height *= grow;

  /**
   * 16의 배수로 맞추면 비율이 틀어진다.
   *
   * 원본 근처에서 위아래로만 반올림하면 못 맞출 때가 있다. 1600×900 은
   * 16:9 인데 900 이 16의 배수가 아니라, 그 언저리에서는 어떻게 굴려도
   * 0.45% 가 어긋난다. 그런데 조금 떨어진 곳에 1024×576 이 있다 — 정확히
   * 16:9 이고 둘 다 16의 배수다.
   *
   * 그래서 **한계 안의 모든 너비를 훑는다.** 16의 배수라 후보가 240개뿐이라
   * 다 봐도 부담이 없다. 너비마다 비율에 가장 가까운 높이를 잡고, 한계를
   * 지키는 것 중에서 고른다.
   *
   * 비율이 먼저다. 크기가 조금 달라지는 것은 눈에 안 띄지만 비율이 틀어지면
   * 첨부한 그림과 다른 모양이 나온다 — 그게 이 기능의 전부다. 비율이 같으면
   * 원본 크기에 가까운 쪽을 쓴다.
   */
  const step = limits.multipleOf;
  const target = source.width / source.height;
  const idealPixels = width * height;

  let best: PixelSize | undefined;
  let bestGap = Infinity;
  let bestPixelGap = Infinity;

  for (let candidateWidth = step; candidateWidth <= limits.maxEdge; candidateWidth += step) {
    const candidateHeight = Math.round(candidateWidth / target / step) * step;
    if (candidateHeight < step || candidateHeight > limits.maxEdge) continue;

    const pixels = candidateWidth * candidateHeight;
    if (pixels < limits.minPixels || pixels > limits.maxPixels) continue;

    const gap = Math.abs(candidateWidth / candidateHeight - target);
    const pixelGap = Math.abs(pixels - idealPixels);
    // 비율 차이가 사실상 같으면(0.0001 이내) 크기로 가른다.
    if (gap < bestGap - 0.0001 || (gap < bestGap + 0.0001 && pixelGap < bestPixelGap)) {
      best = { width: candidateWidth, height: candidateHeight };
      bestGap = Math.min(gap, bestGap);
      bestPixelGap = pixelGap;
    }
  }

  if (!best) {
    return { mode: "pixel", rejected: "첨부한 그림의 크기를 이 모델의 한계 안으로 맞추지 못했습니다." };
  }
  return { mode: "pixel", pixel: best };
}

/** 이 모델이 이 비율을 만들 수 있나. */
function canMake(model: ImageModel, ratioId: string): boolean {
  if (ratioId === MATCH_SOURCE) return Boolean(model.pixelSizeLimits);

  const ratio = POSTER_RATIOS.find((entry) => entry.id === ratioId);
  if (!ratio) return false;
  if (model.pixelSizeLimits) return true;
  if (ratio.pixelOnly) return false;
  return Boolean(model.supportedRatios?.includes(ratio.enumFallback ?? ratio.id));
}

export function chooseModelForRatio(
  ratioId: string,
  preferredId: string,
  models: ImageModel[],
): ModelChoice {
  const fallback = models.find((model) => model.isDefault) ?? models[0]!;
  const preferred = models.find((model) => model.id === preferredId) ?? fallback;

  if (canMake(preferred, ratioId)) return { model: preferred, switched: false };

  const able = models.find((model) => canMake(model, ratioId));
  if (!able) {
    return {
      model: preferred,
      switched: false,
      reason: `${ratioId} 를 만들 수 있는 모델이 없습니다.`,
    };
  }

  const what = ratioId === MATCH_SOURCE ? "첨부한 그림과 같은 비율" : ratioId;
  return {
    model: able,
    switched: true,
    reason: `${preferred.label} 은 ${what} 을 만들 수 없어 ${able.label} 로 만듭니다.`,
  };
}
