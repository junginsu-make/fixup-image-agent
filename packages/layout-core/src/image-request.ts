import {
  IMAGE_MODELS,
  nearestEnumRatio,
  sizeFromSource,
  type ImageModel,
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

function candidateFor(model: ImageModel, rect: CardSize): Candidate | undefined {
  const aspect = rect.width / rect.height;

  if (model.pixelSizeLimits) {
    const size = sizeFromSource(rect, model);
    if (!size.pixel) return undefined;
    return { model, size, gap: Math.abs(size.pixel.width / size.pixel.height - aspect) / aspect };
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
      notes: [`${preferred.label} 은 이 칸 비율을 만들 수 없어 ${exact.model.label} 로 만듭니다.`],
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
    : [`${preferred.label} 은 이 칸 비율을 만들 수 없어 ${best.model.label} 로 만듭니다.`];
  notes.push("이 칸 비율을 정확히 만들 수 있는 모델이 없어 가장 가까운 비율로 만든 뒤 가운데를 잘라 넣습니다.");
  return { model: best.model, size: best.size, crop: true, notes };
}
