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

/**
 * 그림 너비의 몇 분의 몇을 글자에 줄지.
 *
 * 0.11 로 두었더니 카드 한 귀퉁이를 통째로 차지했다. 알리는 것이 목적이지
 * 읽히는 것이 목적은 아니다 — 절반으로 줄여 "표기가 있다" 정도만 남긴다.
 */
const WIDTH_RATIO = 0.055;
/** 가장자리에서 띄우는 정도. 역시 너비 기준이다. */
const MARGIN_RATIO = 0.022;
/**
 * 얼마나 옅게. 0 은 안 보이고 1 은 또렷하다.
 *
 * 0.38 은 눈에 먼저 들어왔다. 들여다보면 보이되 그림을 볼 때는 걸리지 않는
 * 정도로 낮춘다. 더 내리면 밝은 바탕에서 아예 사라진다.
 */
export const BADGE_OPACITY = 0.15;

/**
 * 표기를 붙일지 말지 저장하는 자리. 값은 "on" / "off" 두 가지다.
 *
 * **적혀 있지 않으면 끈 것으로 본다.** 표기는 만든 그림 파일 안에 지울 수 없게
 * 새겨지므로, 잘못 켜져 있으면 이미 내보낸 그림을 되돌릴 방법이 없다. 반대로
 * 잘못 꺼져 있으면 켜고 다시 뽑으면 된다 — 되돌릴 수 있는 쪽을 기본으로 둔다.
 *
 * 켜는 것은 관리자가 명시적으로 켰을 때뿐이다.
 */
export const AI_BADGE_SETTING_KEY = "ai_badge_enabled";

export function aiBadgeEnabledFrom(value: string | null | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "on";
}

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
  //
  // 높이를 먼저 정수로 떨어뜨리고 너비를 거기 맞춘다. 반대로 하면 표기가
  // 작아질수록 찌그러진다 — 높이가 13픽셀일 때 1픽셀은 8% 다.
  let height = Math.max(1, Math.round(Math.round(canvas.width * WIDTH_RATIO) / aspect));
  let width = Math.max(1, Math.round(height * aspect));
  let margin = Math.round(canvas.width * MARGIN_RATIO);

  // 아주 작거나 아주 납작한 그림에서는 그대로 두면 밖으로 나간다.
  const maxWidth = Math.max(1, canvas.width - margin * 2);
  const maxHeight = Math.max(1, canvas.height - margin * 2);
  const shrink = Math.min(1, maxWidth / width, maxHeight / height);
  if (shrink < 1) {
    height = Math.max(1, Math.floor(height * shrink));
    width = Math.max(1, Math.min(Math.round(height * aspect), maxWidth));
  }

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
