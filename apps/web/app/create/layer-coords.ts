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
 * **이 저장소는 460px 고정 좌표계다.** 비율로 저장하지 않는다 — 안쪽 캔버스
 * 폭을 460 으로 못 박고, 좁은 화면에서는 겉껍데기만 줄인다. 저장된 좌표의
 * 뜻이 화면 폭과 무관해지므로 설계 §11 이 요구한 것과 결과가 같다(고정 기준폭은
 * 비율 좌표를 460 배 해 둔 것과 수학적으로 같다).
 *
 * **비율 변환 함수를 두지 않는다.** 한때 `toStoredLayer`/`toCanvasLayer` 를
 * 만들어 뒀는데 아무도 안 불렀다. 그 상태로 시험이 초록이면 다음 사람이
 * 「좌표가 정규화돼 있다」고 읽는다 — 안 돼 있다. 거짓 자신감만 남는다.
 *
 * ── 옛 레이어 ────────────────────────────────────────────────
 *
 * 비율이 없던 시절에 저장된 것도 **460px 에서 놓은 것으로 읽는다**(설계 §5.1).
 * 그때 대부분이 그 폭에서 작업했다. 원래 좁은 화면에서 놓았다면 완벽히
 * 복원되지 않는다 — 그 사실을 숨기지 않는다.
 */

/**
 * 캔버스의 기준 폭. **CSS 의 `.imageCanvas{width}` 와 같아야 한다.**
 *
 * 한쪽만 고치면 좁은 화면에서 축소가 모자라 캔버스가 삐져나가고, 저장된 모든
 * 레이어가 밀린다. `__tests__/layer-coords.test.ts` 가 CSS 를 읽어 대조한다.
 */
export const LEGACY_CANVAS_WIDTH = 460;

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

/**
 * 미리보기에서 레이어를 얼마나 키우거나 줄일 것인가.
 *
 * `canvasFitFor` 와 달리 **1 을 넘을 수 있다.** 편집 캔버스는 460 이 상한이지만
 * 이어보기는 그보다 넓게 보여 줄 수 있고, 그때는 글자도 함께 커져야 같은 자리다.
 */
export function previewFitFor(displayWidth: number | undefined): number {
  if (!displayWidth) return 1;
  return displayWidth / LEGACY_CANVAS_WIDTH;
}

/**
 * 줄맞춤을 바꿀 때 상자를 얼마나 넓힐 것인가.
 *
 * 줄맞춤(가운데·오른쪽)은 상자가 좁으면 티가 안 나서 함께 넓혀 준다. 그런데
 * 전에는 **캔버스를 벗어나는지 안 봤다** — 42px 글자를 왼쪽(x=52)에 두고
 * 가운데 정렬로 바꾸면 폭 420 이 되어 오른쪽 끝이 472 가 됐다. 460 짜리
 * 캔버스에서 잘린다.
 *
 * **이미 넓으면 줄이지 않는다.** 사용자가 정한 폭이다.
 */
export function alignedWidthFor(layer: { x: number; width: number; fontSize: number }): number {
  const recommended = Math.min(520, Math.max(220, Math.round(layer.fontSize * 10)));
  // 지금 자리에서 오른쪽 끝까지 남은 만큼이 상한이다.
  const room = Math.max(40, LEGACY_CANVAS_WIDTH - layer.x);
  return Math.max(layer.width, Math.min(recommended, room));
}

/** 새 레이어를 놓을 자리 하나. */
export interface LayerOrigin {
  x: number;
  y: number;
}

/** 겹쳤다고 볼 거리. 이보다 가까우면 같은 자리로 친다. */
const OVERLAP = 8;
/** 비켜 놓는 간격. */
const OFFSET = 24;

/**
 * 새 레이어를 어디에 놓을 것인가.
 *
 * 전에는 **늘 같은 자리**(52, 52)였다. 문구를 여러 개 얹으면 정확히 포개져,
 * 사용자는 하나만 생긴 줄 알고 또 누른다.
 *
 * 빈자리를 찾아 대각선으로 비켜 놓되 **캔버스 밖으로는 안 나간다.**
 */
export function nextLayerOrigin(
  existing: LayerOrigin[],
  base: LayerOrigin,
  box: { width: number; height: number; canvasHeight: number } = {
    width: 0,
    height: 0,
    canvasHeight: LEGACY_CANVAS_WIDTH,
  },
): LayerOrigin {
  /*
    **상자가 들어갈 자리까지 본다.** 전에는 자리(x)만 460-60 으로 묶었는데,
    헤드라인 기본 폭이 360 이라 x=124 면 오른쪽 끝이 484 로 넘쳤다.

    **세로 한계는 캔버스 높이다.** 전에는 여기에도 폭에서 온 400 을 썼다.
    1:1 은 높이가 460, 9:16 은 818 이라 뜻이 전혀 다르다 — 1:1 작업에서
    열일곱째쯤부터 새 레이어가 캔버스 아래로 나가 안 보였다.
  */
  const maxX = Math.max(0, LEGACY_CANVAS_WIDTH - box.width);
  const maxY = Math.max(0, box.canvasHeight - box.height);
  let { x, y } = base;

  for (let step = 0; step < 40; step += 1) {
    const taken = existing.some(
      (one) => Math.abs(one.x - x) < OVERLAP && Math.abs(one.y - y) < OVERLAP,
    );
    if (!taken && x <= maxX && y <= maxY) return { x, y };

    x += OFFSET;
    y += OFFSET;
    // 한쪽 끝에 닿으면 기본 자리로 돌아온다. 밖으로 밀어내지 않는다.
    if (x > maxX || y > maxY) {
      x = Math.min(base.x, maxX);
      y = Math.min(base.y, maxY);
      // 기본 자리도 이미 찼으면 더 볼 것이 없다.
      break;
    }
  }
  return { x: Math.min(base.x, maxX), y: Math.min(base.y, maxY) };
}

/**
 * 460 기준 좌표계에서 이 화면비의 캔버스 높이.
 *
 * 1:1 은 460, 3:4 는 613, 9:16 은 818 이다. **세로 한계를 폭으로 대신하면**
 * 1:1 작업에서 새 레이어가 캔버스 아래로 나가 안 보인다.
 */
export function canvasHeightFor(aspectRatio: string | undefined): number {
  const [w, h] = String(aspectRatio ?? "3:4").split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !w) return LEGACY_CANVAS_WIDTH;
  return Math.round((LEGACY_CANVAS_WIDTH * h) / w);
}
