/**
 * 레이어가 어느 화면에서 봐도 같은 자리에 있게 한다.
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────
 *
 * 레이어 좌표가 **캔버스 CSS 픽셀 절대값**이고, 캔버스는 `min(100%, 460px)` 라
 * 창이 좁으면 함께 줄어든다. 데스크톱(460px)에서 오른쪽에 붙여 배치한 글자가
 * 휴대폰(300px)에서는 캔버스 밖으로 나가 **잘린 채로 구워진다.**
 *
 * ── 어떻게 고치나 ────────────────────────────────────────────
 *
 * 설계 §11: 「문서 좌표계를 원본 이미지 픽셀 또는 정규화 좌표로 고정한다.
 * 화면 크기는 viewport scale 일 뿐 저장 좌표가 아니다.」
 *
 * **저장은 비율(0~1)로, 화면은 지금 폭을 곱해서** 쓴다. 글자 크기도 비율이다 —
 * 안 그러면 좁은 화면에서만 글자가 상대적으로 커 보인다.
 *
 * ── 옛 레이어 ────────────────────────────────────────────────
 *
 * 비율 칸이 없던 시절에 저장된 것은 **460px 에서 놓은 것으로 읽는다**
 * (설계 §5.1). 그때 대부분의 사람이 그 폭에서 작업했다. 원래 좁은 화면에서
 * 놓았다면 완벽히 복원되지 않는다 — 그 사실을 숨기지 않는다.
 */

/** 비율이 없던 시절의 기준 폭. 그때 캔버스 상한이 이 값이었다. */
export const LEGACY_CANVAS_WIDTH = 460;

/** 화면에 그릴 때 쓰는 값. 지금 캔버스 폭 기준 픽셀이다. */
export interface CanvasGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

/** 저장할 때 쓰는 값. 캔버스 폭에 대한 비율이라 화면 크기와 무관하다. */
export interface StoredGeometry {
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  fontSizeRatio: number;
}

/** 옛 저장본. 비율 칸이 없고 픽셀만 있다. */
interface LegacyGeometry {
  x: number;
  y: number;
  width: number | string;
  height: number | string;
  fontSize?: number;
}

/** `"50%"` 처럼 적힌 값을 픽셀로. 숫자면 그대로. */
function toPixels(value: number | string, base: number): number {
  if (typeof value === "number") return value;
  const percent = /^(-?[\d.]+)%$/.exec(value.trim());
  if (percent) return (Number(percent[1]) / 100) * base;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasRatios(value: StoredGeometry | LegacyGeometry): value is StoredGeometry {
  return typeof (value as StoredGeometry).xRatio === "number";
}

export function toStoredLayer(
  geometry: { x: number; y: number; width: number | string; height: number | string; fontSize?: number },
  canvasWidth: number,
): StoredGeometry {
  const width = Math.max(1, canvasWidth);
  return {
    xRatio: geometry.x / width,
    yRatio: geometry.y / width,
    widthRatio: toPixels(geometry.width, width) / width,
    heightRatio: toPixels(geometry.height, width) / width,
    fontSizeRatio: (geometry.fontSize ?? 0) / width,
  };
}

export function toCanvasLayer(
  stored: StoredGeometry | LegacyGeometry,
  canvasWidth: number,
): CanvasGeometry {
  const width = Math.max(1, canvasWidth);

  const ratios = hasRatios(stored)
    ? stored
    : // 비율이 없으면 옛 저장본이다. 460px 에서 놓은 것으로 읽는다.
      toStoredLayer(stored, LEGACY_CANVAS_WIDTH);

  const layerWidth = ratios.widthRatio * width;
  const layerHeight = ratios.heightRatio * width;

  /*
    **캔버스 밖으로 못 나가게 한다**(설계 §11).
    비율이 1 을 넘거나 음수인 값이 들어와도 잘린 그림을 만들지 않는다.
  */
  const maxX = Math.max(0, width - layerWidth);
  return {
    x: Math.min(Math.max(0, ratios.xRatio * width), maxX),
    y: Math.max(0, ratios.yRatio * width),
    width: layerWidth,
    height: layerHeight,
    fontSize: ratios.fontSizeRatio * width,
  };
}

/**
 * 좁은 화면에서 캔버스 겉을 얼마나 줄일 것인가.
 *
 * 안쪽은 늘 460px 이고 이 배율만 바뀐다. 그래서 **좌표의 뜻이 화면 폭과
 * 무관해진다** — 어느 기기에서 열어도 같은 자리다.
 *
 * 아직 안 붙었으면(`0`·`undefined`) 줄이지 않는다. 0 을 곱하면 화면이 사라진다.
 */
export function canvasFitFor(availableWidth: number | undefined): number {
  if (!availableWidth) return 1;
  return Math.min(1, availableWidth / LEGACY_CANVAS_WIDTH);
}
