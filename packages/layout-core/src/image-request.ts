import {
  IMAGE_MODELS,
  nearestEnumRatio,
  type ImageModel,
  type PixelSize,
  type ResolvedSize,
} from "@fixup/sns-core";
import type { CardSize } from "./slots";

/**
 * 칸 하나가 fal 요청 하나다. **칸 비율을 그대로 요청한다.**
 *
 * 카드 전체 비율로 만들어 칸에 욱여넣으면 여백이 생기거나 주제가 잘린다.
 * 칸이 0.5 × 0.4 이고 카드가 1088×1360 이면 544×544 — 1:1 로 부른다.
 *
 * 고른 모델이 그 비율을 못 만들면 **만들 수 있는 모델로 바꾼다.** 조용히
 * 바꾸지는 않는다. 바꾼 이유를 함께 돌려줘서 화면이 말하게 한다.
 * 그래도 안 되면 가장 가까운 비율로 만들고 가운데를 잘라 넣는다 — 이때만
 * 잘리고, 잘랐으면 알린다.
 */

/** 이 안이면 같은 비율로 본다. 1%. */
const ASPECT_TOLERANCE = 0.01;

/** 픽셀 모델에서 「비율이 맞다」고 볼 범위. 이 안에서는 크기로 고른다. */
const PIXEL_ASPECT_TOLERANCE = 0.005;

export interface SlotImagePlan {
  model: ImageModel;
  size: ResolvedSize;
  /** 받은 그림의 가운데를 칸 비율로 잘라 써야 하나. */
  crop: boolean;
  /** 모델을 바꿨거나 잘리게 된 이유. 그대로 화면에 보여 준다. */
  notes: string[];
}

interface Candidate {
  model: ImageModel;
  size: ResolvedSize;
  /** 칸 비율과 얼마나 어긋나는가. 0 이면 딱 맞는다. */
  gap: number;
}

function ratioValue(id: string): number | null {
  const [width, height] = id.split(":").map(Number);
  return width && height ? width / height : null;
}

/**
 * 픽셀 모델에 시킬 크기 — **비율은 맞추되 크기도 칸에 맞춘다.**
 *
 * `sns-core` 의 `sizeFromSource` 를 쓰지 않는다. 그쪽은 첨부한 그림의 비율을
 * 지키는 것이 전부라, 비율 차이가 0.0001 만 좋아도 훨씬 큰 후보를 고른다.
 * 임의 칸 비율은 작은 크기에서 16의 배수로 딱 떨어지지 않으므로 큰 쪽이
 * 계속 이겼다 — 기본 뼈대에서 칸의 **최대 20.8배**를 시키고 있었다(실측).
 * 그러면 fal 이 느려지고, 가격표 행이 한 칸 올라가 값도 더 낸다. 받은 그림은
 * 어차피 칸 크기로 줄여 붙이므로 그 큰 픽셀은 통째로 버려진다.
 *
 * 그래서 **비율이 맞는 후보들 중 픽셀 수가 칸에 가장 가까운 것**을 고른다.
 * 그 안에 후보가 없으면 비율이 가장 가까운 것으로 떨어진다(그때는 잘린다).
 *
 * `sizeFromSource` 를 고치지 않는 이유는 그것이 첨부 비율 맞추기의 정답이고
 * 포스터가 그 동작에 기대고 있기 때문이다. 설계도 sns-core 를 건드리지
 * 말라고 못 박았다.
 */
function pixelSizeFor(
  rect: CardSize,
  limits: NonNullable<ImageModel["pixelSizeLimits"]>,
): PixelSize | undefined {
  const aspect = rect.width / rect.height;
  if (aspect > limits.maxAspect || 1 / aspect > limits.maxAspect) return undefined;

  const step = limits.multipleOf;
  const wanted = rect.width * rect.height;

  let best: PixelSize | undefined;
  let bestPixelGap = Infinity;
  let nearest: PixelSize | undefined;
  let nearestAspectGap = Infinity;

  // 후보는 16의 배수뿐이라 240개 남짓이다. 다 봐도 부담이 없다.
  for (let width = step; width <= limits.maxEdge; width += step) {
    const height = Math.round(width / aspect / step) * step;
    if (height < step || height > limits.maxEdge) continue;

    const pixels = width * height;
    if (pixels < limits.minPixels || pixels > limits.maxPixels) continue;

    const aspectGap = Math.abs(width / height - aspect) / aspect;
    if (aspectGap < nearestAspectGap) {
      nearest = { width, height };
      nearestAspectGap = aspectGap;
    }
    if (aspectGap > PIXEL_ASPECT_TOLERANCE) continue;

    const pixelGap = Math.abs(pixels - wanted);
    if (pixelGap < bestPixelGap) {
      best = { width, height };
      bestPixelGap = pixelGap;
    }
  }
  return best ?? nearest;
}

function candidateFor(model: ImageModel, rect: CardSize): Candidate | undefined {
  const aspect = rect.width / rect.height;

  if (model.pixelSizeLimits) {
    const pixel = pixelSizeFor(rect, model.pixelSizeLimits);
    if (!pixel) return undefined;
    return {
      model,
      size: { mode: "pixel", pixel },
      gap: Math.abs(pixel.width / pixel.height - aspect) / aspect,
    };
  }

  const supported = model.supportedRatios ?? [];
  const nearest = nearestEnumRatio(rect, supported);
  const value = nearest ? ratioValue(nearest) : null;
  if (!nearest || !value) return undefined;
  return {
    model,
    size: {
      mode: "enum",
      aspectRatio: nearest,
      ...(model.fixedResolution ? { resolution: model.fixedResolution } : {}),
    },
    gap: Math.abs(value - aspect) / aspect,
  };
}

export function planSlotImage(
  rect: CardSize,
  preferredModelId: string,
  models: ImageModel[] = IMAGE_MODELS,
): SlotImagePlan {
  const fallback = models.find((model) => model.isDefault) ?? models[0]!;
  const preferred = models.find((model) => model.id === preferredModelId) ?? fallback;

  const mine = candidateFor(preferred, rect);
  if (mine && mine.gap <= ASPECT_TOLERANCE) {
    return { model: mine.model, size: mine.size, crop: false, notes: [] };
  }

  const others = models
    .filter((model) => model.id !== preferred.id)
    .flatMap((model) => {
      const candidate = candidateFor(model, rect);
      return candidate ? [candidate] : [];
    })
    .sort((first, second) => first.gap - second.gap);

  const exact = others.find((candidate) => candidate.gap <= ASPECT_TOLERANCE);
  if (exact) {
    return {
      model: exact.model,
      size: exact.size,
      crop: false,
      notes: [`${preferred.label} 은 이 칸 비율에 맞는 크기가 없어 ${exact.model.label} 로 만듭니다.`],
    };
  }

  // 아무도 딱 맞게 못 만든다. 가장 가까운 것으로 만들고 가운데를 잘라 넣는다.
  const best = [mine, ...others].flatMap((candidate) => (candidate ? [candidate] : []))
    .sort((first, second) => first.gap - second.gap)[0];
  if (!best) {
    throw new Error("이 칸 비율로 그림을 만들 수 있는 모델이 없습니다.");
  }

  const notes = best.model.id === preferred.id
    ? []
    : [`${preferred.label} 은 이 칸 비율에 맞는 크기가 없어 ${best.model.label} 로 만듭니다.`];
  notes.push("이 칸 비율을 정확히 만들 수 있는 모델이 없어 가장 가까운 비율로 만든 뒤 가운데를 잘라 넣습니다.");
  return { model: best.model, size: best.size, crop: true, notes };
}
