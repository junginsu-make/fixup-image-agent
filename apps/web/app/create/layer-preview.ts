/**
 * **끄는 동안은 임시 자리, 놓을 때 확정**(B-12-c).
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────
 *
 * 레이어를 끌면 `onDrag` 가 **프레임마다** `updateOverlay` 를 불렀다. 그러면
 *
 *   1. `setOverlaysBySection` → 편집기가 다시 그린다
 *   2. 그 값이 `onDraftStateChange` 로 올라가 **부모(`PdpMakerClient`)가 다시
 *      그린다.** 2,000줄짜리 화면이다
 *   3. 부모가 초안 전체를 다시 조립해 저장 시계에 넣는다 → 프레임마다 「수정됨」
 *
 * 크기 조절(`onResize`)도 같은 기계였다.
 *
 * ── 잰 값 (2026-09-21, 1초 드래그 = 60프레임, W8 대표 초안) ─
 *
 *   저장 시계 수정 횟수   **61회** → 고친 뒤 **2회**
 *   시계가 하는 일         2.8ms (프레임당 0.05ms)
 *
 * **JS 일 자체는 싸다.** 값을 내는 것은 부모 트리를 60번 다시 그리는 쪽인데,
 * 그것은 브라우저 없이 못 쟀다(`docs/bugs/pdp-validation/w8-measurements.md`).
 * 그래서 고친 근거는 「느리다」가 아니라 **「할 필요 없는 일을 한다」**이다 —
 * 놓기 전의 중간 좌표는 저장할 값이 아니다.
 *
 * 설계 §14.4: 「drag마다 부모 전체 rerender | **성능 계측 후 임시
 * state/commit 분리** | W6/W8 / 드래그 응답과 저장 수」.
 */

/**
 * 끄는(또는 크기를 바꾸는) 중인 레이어의 임시 값.
 *
 * `id` 로 어느 레이어인지 가른다. 준 칸만 덮고 나머지는 원래 값을 지킨다 —
 * 끌기는 좌표만, 크기 조절은 크기와 글자 크기까지 준다.
 */
export type LayerPreview = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fontSize?: number;
} | null;

/**
 * 화면에 보일 값.
 *
 * **바뀐 것이 없으면 같은 객체를 돌려준다.** 새 객체를 늘 만들면 아래쪽
 * 메모이제이션이 통째로 무너져, 고치려던 재렌더가 그대로 남는다.
 */
export function previewedLayer<T extends { id: string }>(layer: T, preview: LayerPreview): T {
  if (!preview || preview.id !== layer.id) return layer;

  const next: Record<string, unknown> = { ...layer, x: preview.x, y: preview.y };
  if (preview.width !== undefined) next.width = preview.width;
  if (preview.height !== undefined) next.height = preview.height;
  if (preview.fontSize !== undefined) next.fontSize = preview.fontSize;
  return next as T;
}
