/**
 * 세로로 긴 디자인 레퍼런스를 **조각으로 나눈다.**
 *
 * 상세페이지 레퍼런스는 보통 1080×10000 처럼 아주 길다. 그대로 보내면 모델이
 * 긴 변 기준으로 줄여서 **폭 100픽셀짜리 띠**가 된다 — 글꼴도 배치도 안 보인다.
 * 원본을 보내든 줄여서 보내든 결과는 같다.
 *
 * 리디자인이 같은 문제를 이미 이 규칙으로 풀고 있다
 * (`apps/web/app/redesign/redesign-wizard.tsx:1427`). 도구마다 다르게 자르면
 * 같은 그림이 도구에 따라 다르게 읽힌다.
 *
 * 여기서는 **자를 자리만** 정한다. 실제로 자르는 일은 `slice-image.ts` 가 한다.
 */

/** 이 비율을 넘으면 긴 상세페이지로 본다. */
const LONG_PAGE_RATIO = 2.2;

/** 한 조각이 대략 이 비율을 넘지 않게 나눈다. */
const SLICE_RATIO = 1.8;

/** 조각이 많아지면 읽는 값보다 비용이 커진다. */
const MAX_SLICES = 4;

export interface SliceRegion {
  top: number;
  height: number;
}

/**
 * 자를 자리를 정한다. 짧은 그림이면 통째로 한 조각이다.
 *
 * 마지막 조각이 남은 높이를 다 가져간다 — 나눗셈 나머지 때문에 아래쪽 몇 줄이
 * 잘리면 푸터·CTA 가 사라진다.
 */
export function planReferenceSlices(width: number, height: number): SliceRegion[] {
  if (!(width > 0) || !(height > 0)) return [{ top: 0, height: Math.max(0, height) }];

  const ratio = height / width;
  if (ratio <= LONG_PAGE_RATIO) return [{ top: 0, height }];

  const count = Math.min(MAX_SLICES, Math.ceil(ratio / SLICE_RATIO));
  const band = Math.floor(height / count);

  return Array.from({ length: count }, (_, index) => {
    const top = band * index;
    return { top, height: index === count - 1 ? height - top : band };
  });
}
