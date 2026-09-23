/**
 * 이어보기를 **한 장으로** 굽는 배치.
 *
 * 그리는 일(캔버스)은 편집기가 한다. 여기서는 어디에 몇 픽셀로 놓을지만
 * 정한다 — 그래야 캔버스 없이 시험할 수 있다.
 */

/**
 * 캔버스 한 변의 상한. 브라우저마다 다르지만 32767 이 공통으로 안전하다.
 * 넘으면 오류 없이 **빈 그림**이 나온다.
 */
export const MAX_CANVAS_SIDE = 32_000;

export interface StitchLayout {
  width: number;
  height: number;
  rows: Array<{ y: number; height: number }>;
}

/**
 * 폭은 가장 넓은 장에 맞추고 위에서 아래로 틈 없이 쌓는다.
 *
 * 너무 길면 **통째로** 줄인다. 한 장만 줄이면 이음매에서 폭이 어긋난다.
 */
export function stitchLayout(
  sizes: ReadonlyArray<{ width: number; height: number }>,
  /**
   * 캔버스 **넓이** 상한. 아이폰 사파리는 약 1,670만 픽셀을 넘으면 오류 없이
   * 빈 그림을 준다. 그 기기에서만 준다 — 데스크톱까지 줄이면 화질만 잃는다.
   */
  options: { maxArea?: number } = {},
): StitchLayout {
  if (sizes.length === 0) return { width: 0, height: 0, rows: [] };

  const widest = Math.max(...sizes.map((size) => size.width));
  const naturalHeight = sizes.reduce((sum, size) => sum + (size.height * widest) / size.width, 0);
  // 넓이는 배율의 제곱으로 준다. 반올림으로 넘치지 않게 조금 덜 쓴다.
  const areaScale = options.maxArea ? Math.sqrt((options.maxArea * 0.995) / (widest * naturalHeight)) : 1;
  const scale = Math.min(1, MAX_CANVAS_SIDE / naturalHeight, areaScale);
  const width = Math.round(widest * scale);

  const rows = sizes.reduce<Array<{ y: number; height: number }>>((placed, size) => {
    const previous = placed.at(-1);
    const y = previous ? previous.y + previous.height : 0;
    return [...placed, { y, height: Math.round((size.height * width) / size.width) }];
  }, []);

  const last = rows[rows.length - 1];
  return { width, height: last.y + last.height, rows };
}
