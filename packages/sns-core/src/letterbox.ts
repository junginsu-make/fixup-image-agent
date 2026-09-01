export interface LetterboxPlan {
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
  usesAi: false;
  reviewRequired: false;
  fillStrategy: "edge_average";
  scale: number;
  warnings: string[];
}

/** 선형 1.5배는 원본 한 픽셀이 출력에서 2.25픽셀 면적을 차지하는 경계다. */
export const UPSCALE_WARNING_THRESHOLD = 1.5;

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function channelHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

/**
 * 원본과 맞닿는 가장자리 픽셀만 평균내 여백색을 정한다.
 * 중앙 피사체 색이 아니라 경계색을 써야 원본과 여백 사이 이음새가 덜 튄다.
 */
export function averageEdgeColor(samples: RgbColor[]): string {
  if (samples.length === 0) throw new Error("가장자리 색상 표본이 없습니다.");
  for (const sample of samples) {
    for (const channel of [sample.r, sample.g, sample.b]) {
      if (!Number.isFinite(channel) || channel < 0 || channel > 255) {
        throw new Error("가장자리 색상 표본은 0~255 RGB 값이어야 합니다.");
      }
    }
  }
  const total = samples.reduce(
    (sum, sample) => ({ r: sum.r + sample.r, g: sum.g + sample.g, b: sum.b + sample.b }),
    { r: 0, g: 0, b: 0 },
  );
  return `#${channelHex(total.r / samples.length)}${channelHex(total.g / samples.length)}${channelHex(total.b / samples.length)}`;
}

/**
 * 원본을 잘라내지 않고 규격 안에 넣는다.
 *
 * 표·도표는 글자가 잘리면 못 쓴다. 그래서 crop 이 아니라 contain 방식의 letterbox 다.
 * 실제 렌더러는 원본 가장자리 픽셀을 뽑아 averageEdgeColor 에 전달한다.
 */
export function letterboxPlan(
  source: { width: number; height: number },
  target: { width: number; height: number },
): LetterboxPlan {
  const scale = Math.min(target.width / source.width, target.height / source.height);
  const drawWidth = Math.round(source.width * scale);
  const drawHeight = Math.round(source.height * scale);
  const warnings = scale > UPSCALE_WARNING_THRESHOLD
    ? [`원본을 ${scale.toFixed(2)}배 확대해야 합니다. 표·문서 글자가 흐려질 수 있으니 더 큰 원본을 쓰거나 결과를 확인해 주세요.`]
    : [];
  return {
    drawWidth,
    drawHeight,
    offsetX: Math.round((target.width - drawWidth) / 2),
    offsetY: Math.round((target.height - drawHeight) / 2),
    usesAi: false,
    reviewRequired: false,
    fillStrategy: "edge_average",
    scale,
    warnings,
  };
}
