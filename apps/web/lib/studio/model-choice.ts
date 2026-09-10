import { IMAGE_MODELS, unitPrice, type ImageModel } from "@fixup/sns-core";

/**
 * 쓸 수 있는 모델만 남긴다 — 고르는 것은 여기서 하지 않는다.
 *
 * 모델 성능을 역할별로 잰 적이 없다. 그런데 "이 역할에는 이 모델" 같은 표를
 * 지금 만들면, 근거 없는 규칙이 코드에 굳어 버린다.
 *
 * 대신 **못 쓰는 것만 걸러낸다.** 이건 근거가 확실하다 — 첨부 장수 상한,
 * 지원하는 비율, 한 번에 만들 수 있는 장수는 모델이 정해 둔 값이다. 넘겨서
 * 보내면 그냥 실패한다.
 *
 * 남은 것 중에서 무엇이 좋을지는 **LLM 이 정한다.** 값과 성질을 함께 넘겨
 * 판단할 거리를 준다.
 */

export interface ModelNeed {
  /** 함께 보낼 그림 수. */
  attachmentCount: number;
  /** 고른 게시 비율. */
  ratioId: string;
  /** 한 번에 만들 장수. */
  variants: number;
  /**
   * 픽셀을 직접 지정해야 하는 규격인가. A4 인쇄용이 그렇다
   * (packages/sns-core/src/ratios.ts 의 pixelOnly).
   */
  pixelOnly?: boolean;
  /** 크기를 아는 경우 값 계산에 쓴다. 모르면 어림한다. */
  size?: { width: number; height: number };
}

export interface UsableModel {
  id: string;
  label: string;
  /** 한 장당 어림값(USD). LLM 이 값을 견줄 때 쓴다. */
  approxUsd: number;
  maxReferenceImages: number;
  batchMax: number;
  /** 이 모델의 성질을 한 줄로. LLM 이 읽고 판단한다. */
  note: string;
}

export interface DroppedModel {
  id: string;
  label: string;
  reason: string;
}

export interface ModelChoice {
  usable: UsableModel[];
  dropped: DroppedModel[];
}

const DEFAULT_SIZE = { width: 1024, height: 1536 };

const NOTES: Record<string, string> = {
  // 빠진 모델은 LLM 에게 성질 없이 이름과 값만 간다 — 안 골라지거나 잘못 골라진다.
  "gpt-image-2.5-flare": "픽셀 크기를 직접 지정할 수 있어 인쇄용·비표준 규격에 쓸 수 있습니다. 참고 그림을 가장 많이(16장) 받고, 같은 화질에서 가장 빠릅니다.",
  "gpt-image-2.5-sunburst": "flare 와 같은 화질·값이지만 글자 배치 지시를 더 잘 지킵니다. 대신 두 배 느립니다 — 장수가 많으면 flare 를 쓰세요.",
  "gpt-image-2": "픽셀 크기를 직접 지정할 수 있어 인쇄용·비표준 규격에 쓸 수 있습니다. 참고 그림을 가장 많이(16장) 받습니다.",
  "nano-banana-pro": "값이 한 장에 고정이라 큰 그림에서 유리합니다. 인물 실사에 강한 편입니다.",
  "nano-banana-2": "지원하는 비율이 가장 넓습니다(4:1, 8:1 같은 띠 모양 포함).",
  "nano-banana": "가장 쌉니다. 대신 참고 그림 7장까지, 한 번에 한 장씩입니다.",
};

function usableSize(need: ModelNeed) {
  return need.size ?? DEFAULT_SIZE;
}

export function feasibleModels(need: ModelNeed): ModelChoice {
  const usable: UsableModel[] = [];
  const dropped: DroppedModel[] = [];

  for (const model of IMAGE_MODELS) {
    const reason = whyNot(model, need);
    if (reason) {
      dropped.push({ id: model.id, label: model.label, reason });
      continue;
    }
    usable.push({
      id: model.id,
      label: model.label,
      approxUsd: unitPrice(model, need.attachmentCount > 0 ? "i2i" : "t2i", usableSize(need)),
      maxReferenceImages: model.maxReferenceImages,
      batchMax: model.batchMax,
      note: NOTES[model.id] ?? "",
    });
  }

  return { usable, dropped };
}

function whyNot(model: ImageModel, need: ModelNeed): string | null {
  // 픽셀을 직접 지정해야 하는 규격은 비율 목록만 받는 모델로는 못 만든다.
  if (need.pixelOnly && !model.pixelSizeLimits) {
    return `${model.label} 는 비율만 받아서 픽셀을 직접 지정하는 규격은 못 만듭니다.`;
  }
  if (need.attachmentCount > model.maxReferenceImages) {
    return `참고 그림을 ${model.maxReferenceImages}장까지 받는데 ${need.attachmentCount}장을 보내려 합니다.`;
  }
  if (need.variants > model.batchMax) {
    return model.batchMax === 1
      ? "한 번에 1장씩만 만들 수 있습니다."
      : `한 번에 ${model.batchMax}장까지 만들 수 있습니다.`;
  }
  // 비율 목록을 가진 모델은 그 안에 있어야 한다. 픽셀 모델은 목록이 없다.
  if (model.supportedRatios && !model.supportedRatios.includes(need.ratioId)) {
    return `${need.ratioId} 비율을 지원하지 않습니다.`;
  }
  if (!model.supportedRatios && !model.pixelSizeLimits) {
    return "이 규격을 만들 수 있는지 알 수 없습니다.";
  }
  return null;
}
