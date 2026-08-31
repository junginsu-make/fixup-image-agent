import type { ImageModel } from "./models";

export interface RatioSpec {
  id: string;
  label: string;
  pixel: { width: number; height: number };
}

/** 네 비율 모두 nano 11종 목록에 있어 대체가 일어나지 않는다. */
export const CARD_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타 피드 4:5",   pixel: { width: 1088, height: 1360 } },
  { id: "1:1",  label: "정사각형 1:1",      pixel: { width: 1088, height: 1088 } },
  { id: "9:16", label: "스토리·릴스 9:16",  pixel: { width: 1152, height: 2048 } },
  { id: "16:9", label: "가로 16:9",         pixel: { width: 2048, height: 1152 } },
];

export interface ResolvedSize {
  mode: "pixel" | "enum";
  pixel?: { width: number; height: number };
  aspectRatio?: string;
  resolution?: string;
  rejected?: string;
}

export function resolveSize(ratioId: string, model: ImageModel): ResolvedSize {
  const ratio = CARD_RATIOS.find((entry) => entry.id === ratioId);
  if (!ratio) return { mode: "pixel", rejected: `모르는 비율입니다: ${ratioId}` };

  if (model.pixelSizeLimits) return { mode: "pixel", pixel: ratio.pixel };

  if (!model.supportedRatios?.includes(ratio.id)) {
    return { mode: "enum", rejected: `${model.label} 은 ${ratio.id} 를 지원하지 않습니다.` };
  }
  return {
    mode: "enum",
    aspectRatio: ratio.id,
    ...(model.fixedResolution ? { resolution: model.fixedResolution } : {}),
  };
}
