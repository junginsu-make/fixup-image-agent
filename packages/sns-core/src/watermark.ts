import type { PixelSize } from "./models";

/**
 * 만든 그림에 "AI 이미지" 를 남긴다.
 *
 * 알리는 것이 목적이므로 **파일 안에 새긴다.** 화면에만 덧씌우면 내려받는
 * 순간 사라져서 아무 소용이 없다.
 *
 * 눈에 거슬리지 않아야 한다. 작게, 옅게, 오른쪽 아래 구석에 둔다. 그래도
 * 없는 것은 아니어야 하므로 바탕이 밝으면 검게, 어두우면 희게 뒤집는다 —
 * 흰 글자만 쓰면 흰 배경에서 아예 안 보인다.
 *
 * 여기에는 계산만 둔다. 실제 합성은 sharp 를 쓰는 쪽이 한다.
 */

/** 그림 너비의 몇 분의 몇을 글자에 줄지. */
const WIDTH_RATIO = 0.11;
/** 가장자리에서 띄우는 정도. 역시 너비 기준이다. */
const MARGIN_RATIO = 0.022;
/** 얼마나 옅게. 0 은 안 보이고 1 은 또렷하다. */
export const BADGE_OPACITY = 0.38;

export interface BadgePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function badgePlacement(canvas: PixelSize, badge: PixelSize): BadgePlacement {
  const aspect = badge.width / badge.height;

  // 너비에 비례시킨다. 고정 크기로 두면 작은 그림에서는 큼직하고 큰 그림에서는
  // 안 보인다.
  let width = Math.round(canvas.width * WIDTH_RATIO);
  let height = Math.round(width / aspect);
  let margin = Math.round(canvas.width * MARGIN_RATIO);

  // 아주 작거나 아주 납작한 그림에서는 그대로 두면 밖으로 나간다.
  const maxWidth = Math.max(1, canvas.width - margin * 2);
  const maxHeight = Math.max(1, canvas.height - margin * 2);
  const shrink = Math.min(1, maxWidth / width, maxHeight / height);
  width = Math.max(1, Math.floor(width * shrink));
  height = Math.max(1, Math.floor(height * shrink));

  // 그래도 안 들어가면 여백부터 줄인다. 글자를 더 줄이면 읽을 수 없다.
  margin = Math.min(margin, Math.floor((canvas.width - width) / 2), Math.floor((canvas.height - height) / 2));
  margin = Math.max(0, margin);

  return {
    left: Math.max(0, canvas.width - width - margin),
    top: Math.max(0, canvas.height - height - margin),
    width,
    height,
  };
}

/**
 * 구석이 밝은가.
 *
 * 못 재면 어두운 쪽으로 본다 — 흰 글자가 기본이고, 확신이 없을 때 기본을
 * 바꿀 이유가 없다.
 */
export function isBrightCorner(samples: ArrayLike<number>): boolean {
  if (!samples.length) return false;
  let total = 0;
  for (let index = 0; index < samples.length; index += 1) total += samples[index]!;
  return total / samples.length > 140;
}
