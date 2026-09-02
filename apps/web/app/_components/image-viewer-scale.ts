/**
 * 확대해 볼 때의 배율 계산.
 *
 * 그림을 자세히 보려면 두 가지가 필요하다 — 전체가 한눈에 들어오는 상태와,
 * 픽셀 그대로인 상태. 앞은 fitScale, 뒤는 배율 1 이다.
 */

export interface PixelSize {
  width: number;
  height: number;
}

/** 화면 안에 다 들어오게 하는 배율. 작은 그림은 늘리지 않는다 — 늘리면 뭉갠다. */
export function fitScale(natural: PixelSize | null, viewport: PixelSize): number {
  if (!natural?.width || !natural.height) return 1;
  const scale = Math.min(viewport.width / natural.width, viewport.height / natural.height);
  return scale < 1 ? scale : 1;
}

/** 지금 무엇을 몇 배로 보고 있는지. 이 값이 없으면 자세히 보는 중인지 알 수 없다. */
export function describeZoom(natural: PixelSize | null, scale: number): string {
  const zoom = scale === 1 ? "원본 크기" : `${Math.round(scale * 100)}%`;
  if (!natural?.width || !natural.height) return zoom;
  return `${natural.width} × ${natural.height} · ${zoom}`;
}
