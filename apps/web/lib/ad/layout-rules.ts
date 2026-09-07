/**
 * 오브젝트를 어디에 얼마나 크게 놓는가.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §5.4 · §5.5
 *
 * **순수하다.** sharp 도 fal 도 안 쓴다 — 판단을 조립 함수 안에 두면 시험이 못
 * 간다. 3단계에서 그 실수를 네 번 겪었다.
 */

/** 오른쪽 여백. **불변식이다** — 자리가 없으면 오브젝트를 줄인다(설계 §5.4 ①). */
export const OBJECT_MARGIN = 24;

/** 캔버스 높이 대비 오브젝트의 최대 높이. */
export const OBJECT_HEIGHT_RATIO = 0.92;

/**
 * 「너무 작다」고 알릴 기준.
 *
 * **근거가 약하다.** 실측에서 정사각이 폭 23%, 4:5 가 18.5% 이므로 4:5 까지는
 * 통과하고 9:16 전신·인물이 걸린다. 다만 「무엇이 광고로 보이는가」라 근거를
 * 못 댄다 — 설계 §9 의 카카오 콘솔 확인과 함께 볼 값이다.
 */
export const MIN_WIDTH_RATIO = 0.15;

export interface Box {
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 오브젝트를 오른쪽에 세로 가운데로 놓는다.
 *
 * **높이가 아니라 상자에 맞춘다.** 초판은 높이만 정해서 폭이 오브젝트 비율에
 * 그대로 끌려다녔다 — 4.24:1 을 넘으면 `left` 가 음수가 되고 `composite` 가
 * **조용히 잘랐다.** 두 방향을 다 보는 것이 `fit: "inside"` 와 같은 계산이다.
 *
 * 왼쪽은 비워 둔다 — 광고주가 글자를 얹을 자리다(설계 §5.2).
 */
export function objectPlacement(canvas: Box, object: Box): Placement {
  const boxWidth = Math.max(1, canvas.width - OBJECT_MARGIN * 2);
  const boxHeight = Math.max(1, Math.round(canvas.height * OBJECT_HEIGHT_RATIO));

  // 두 방향 모두 본다. 하나라도 빠지면 그쪽으로 넘친다.
  const scale = Math.min(boxHeight / object.height, boxWidth / object.width);

  // **반올림이 아니라 내림이다.** 반올림하면 경계에서 1픽셀 넘칠 수 있다.
  const width = Math.max(1, Math.floor(object.width * scale));
  const height = Math.max(1, Math.floor(object.height * scale));

  return {
    left: canvas.width - width - OBJECT_MARGIN,
    top: Math.round((canvas.height - height) / 2),
    width,
    height,
  };
}

/**
 * 오브젝트가 너무 작아졌는가. **막지 않고 알린다**(설계 §5.4 ②).
 *
 * 세로로 긴 피사체(사람 전신, 병, 튜브형 제품)는 가로로 긴 배너에서 폭 5~13%
 * 까지 쪼그라든다. 1029px 배너에 111px 짜리 물체 하나면 **빈 배너에 점 하나**다.
 * 그런데 「오브젝트가 사라지지 않았다」 검사는 이것을 **통과시킨다** — 오브젝트는
 * 분명히 있으니까.
 *
 * **늘이거나 자르지 않는다.** 늘이면 사람이 찌그러지고 자르면 얼굴이 잘린다 —
 * 둘 다 광고로 못 쓴다. 사람이 보고 다른 마스터를 고르는 편이 낫다.
 */
export function isTooSmall(canvas: Box, placement: Placement): boolean {
  return placement.width / canvas.width < MIN_WIDTH_RATIO;
}
