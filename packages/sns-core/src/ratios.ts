import type { ImageModel } from "./models";

export interface RatioSpec {
  id: string;
  label: string;
  pixel: { width: number; height: number };
  /**
   * 열거 모델(nano 계열)이 이 비율을 그대로 못 받을 때 대신 쓸 값.
   * 최근접 계산에 맡기지 않고 못 박는다 — 같은 입력에 같은 결과가 나와야 한다.
   */
  enumFallback?: string;
  /** 픽셀을 직접 지정하는 모델에서만 만들 수 있다. */
  pixelOnly?: { reason: string };
}

/** 네 비율 모두 nano 11종 목록에 있어 대체가 일어나지 않는다. */
export const CARD_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타 피드 4:5",   pixel: { width: 1088, height: 1360 } },
  { id: "1:1",  label: "정사각형 1:1",      pixel: { width: 1088, height: 1088 } },
  { id: "9:16", label: "스토리·릴스 9:16",  pixel: { width: 1152, height: 2048 } },
  { id: "16:9", label: "가로 16:9",         pixel: { width: 2048, height: 1152 } },
];

/**
 * 포스터는 인쇄를 염두에 두므로 카드뉴스보다 목록이 넓다.
 *
 * A4 를 둘로 나눈 이유: 1088×1536 은 A4 **비율**은 맞지만 실제 용지에 인쇄하면
 * 약 131dpi 다. 화면 시안에는 충분해도 인쇄물이라고 부르면 오해를 만든다.
 */
export const POSTER_RATIOS: RatioSpec[] = [
  { id: "4:5",  label: "인스타 피드 4:5",      pixel: { width: 1088, height: 1360 } },
  { id: "1:1",  label: "정사각형 1:1",         pixel: { width: 1088, height: 1088 } },
  { id: "9:16", label: "스토리·릴스 9:16",     pixel: { width: 1152, height: 2048 } },
  { id: "2:3",  label: "포스터 세로 2:3",      pixel: { width: 1024, height: 1536 } },
  { id: "3:4",  label: "포스터 세로(넓은) 3:4", pixel: { width: 1152, height: 1536 } },
  { id: "16:9", label: "가로 배너 16:9",       pixel: { width: 2048, height: 1152 } },
  {
    id: "a4-draft",
    label: "A4 비율 시안",
    pixel: { width: 1088, height: 1536 },
    // 3:4(1.333)와 2:3(1.5)은 목표 1.414 에서 거리가 0.081 대 0.086 으로 6% 차이뿐이다.
    // 더 짧은 쪽이라 인쇄할 때 여백으로 처리하기 쉬워 3:4 로 못 박는다.
    enumFallback: "3:4",
  },
  {
    id: "a4-print",
    label: "A4 인쇄용 (약 290dpi)",
    pixel: { width: 2400, height: 3392 },
    pixelOnly: { reason: "A4 인쇄용은 픽셀을 직접 지정해야 해서 GPT Image 계열로만 만들 수 있습니다." },
  },
  {
    // 실제 크기는 첨부한 그림을 보고 그때 정한다. 여기 픽셀은 자리를 채우는 값이다.
    id: "match-source",
    label: "첨부한 그림과 같은 비율",
    pixel: { width: 1088, height: 1088 },
    pixelOnly: { reason: "첨부한 비율을 그대로 쓰려면 픽셀을 직접 지정해야 해서 GPT Image 계열로만 만들 수 있습니다." },
  },
];

export interface ResolvedSize {
  mode: "pixel" | "enum";
  pixel?: { width: number; height: number };
  aspectRatio?: string;
  resolution?: string;
  rejected?: string;
}

function resolveFrom(ratios: RatioSpec[], ratioId: string, model: ImageModel): ResolvedSize {
  const ratio = ratios.find((entry) => entry.id === ratioId);
  if (!ratio) return { mode: "pixel", rejected: `모르는 비율입니다: ${ratioId}` };

  if (model.pixelSizeLimits) return { mode: "pixel", pixel: ratio.pixel };

  if (ratio.pixelOnly) return { mode: "enum", rejected: ratio.pixelOnly.reason };

  const aspectRatio = ratio.enumFallback ?? ratio.id;
  if (!model.supportedRatios?.includes(aspectRatio)) {
    return { mode: "enum", rejected: `${model.label} 은 ${aspectRatio} 를 지원하지 않습니다.` };
  }
  return {
    mode: "enum",
    aspectRatio,
    ...(model.fixedResolution ? { resolution: model.fixedResolution } : {}),
  };
}

/** 카드뉴스. 네 비율만 안다. */
export function resolveSize(ratioId: string, model: ImageModel): ResolvedSize {
  return resolveFrom(CARD_RATIOS, ratioId, model);
}

/** 포스터. 인쇄 규격까지 안다. */
export function resolvePosterSize(ratioId: string, model: ImageModel): ResolvedSize {
  return resolveFrom(POSTER_RATIOS, ratioId, model);
}
