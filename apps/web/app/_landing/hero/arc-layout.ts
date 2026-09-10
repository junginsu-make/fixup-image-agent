/**
 * 판들을 **보는 사람을 감싸는 고리** 위에 놓는다.
 *
 * 평평하게 늘어놓으면 그냥 슬라이드다. 원통 안쪽에 붙이면 가운데는 정면으로,
 * 양옆은 안으로 돌아가 보인다 — 공간감이 여기서 나온다.
 *
 * **칸을 똑같이 나누지 않는다.** 이미지마다 비율이 다르다(1:1·16:9·9:16).
 * 높이는 모두 같게 두고 **가로만 비율대로** 잡은 뒤, 그 폭만큼 자리를
 * 차지하게 한다. 그래야 세로로 긴 그림 옆에 틈이 벌지 않고, 가로로 긴 그림이
 * 옆 판을 덮지 않는다. 판 사이에는 일정한 틈만 남는다.
 *
 * **화면 밖에서 값으로 잰다.** 캔버스 안에서 계산하면 눈으로만 확인하게 되고,
 * 「가운데가 아니라 한 칸 옆이 정면」 같은 어긋남을 아무도 못 잡는다.
 */

/** 판 사이의 틈(월드 단위). 붙어 있되 이어져 보이도록 아주 조금만 둔다. */
export const GAP = 0.3;

/**
 * 원통 반지름. 클수록 완만하게 감긴다.
 *
 * 판을 키우면(2026-09-10 화면을 꽉 채우게) 같은 반지름에서는 한 장이 차지하는
 * 각도가 커져 가로로 긴 그림이 통째로 돌아가 버린다. 그래서 함께 키웠다.
 */
export const RADIUS = 11.5;

/** 가운데에서 이 각도를 넘어간 판은 안 그린다(라디안). 뒤통수까지 그릴 일은 없다. */
export const VISIBLE_ANGLE = 1.15;

export interface PlacedItem {
  index: number;
  /** 가운데에서 얼마나 떨어졌나(월드 단위 호 길이). 음수는 왼쪽. */
  offset: number;
  /** 판의 가로. 높이는 모두 같다. */
  width: number;
  x: number;
  z: number;
  rotationY: number;
}

export interface Ring {
  /** 각 판의 중심이 고리 위 어디에 있나(호 길이). */
  centers: number[];
  /** 고리 한 바퀴의 길이. 이만큼 끌면 제자리로 돌아온다. */
  total: number;
}

/**
 * 폭을 차례로 쌓아 고리를 만든다.
 *
 * 판 하나가 차지하는 자리는 **제 폭 + 틈**이다. 중심은 그 자리의 한가운데다.
 */
export function buildRing(widths: number[], gap = GAP): Ring {
  const centers: number[] = [];
  let cursor = 0;

  for (const width of widths) {
    centers.push(cursor + width / 2);
    cursor += width + gap;
  }

  return { centers, total: cursor };
}

/**
 * 가장 가까운 쪽으로 감는다.
 *
 * 마지막 판은 첫 판의 **오른쪽이 아니라 왼쪽**이다. 이걸 안 감으면 끝에서
 * 처음으로 넘어갈 때 판 전체가 반대편으로 날아간다.
 */
export function wrapArc(raw: number, total: number): number {
  if (!(total > 0)) return 0;
  const half = total / 2;
  const wrapped = ((raw % total) + total) % total;
  return wrapped > half ? wrapped - total : wrapped;
}

/** 한 장의 자리. `scroll` 은 지금 가운데에 온 호 길이다. */
export function placeItem(index: number, ring: Ring, widths: number[], scroll: number): PlacedItem {
  const offset = wrapArc((ring.centers[index] ?? 0) - scroll, ring.total);
  // 호 길이를 각도로 바꾼다. 반지름이 클수록 같은 거리가 덜 돈다.
  const angle = offset / RADIUS;
  return {
    index,
    offset,
    width: widths[index] ?? 0,
    x: Math.sin(angle) * RADIUS,
    // 가운데 판이 z=0 에 오도록 반지름만큼 당긴다. 안 그러면 전부 뒤로 밀린다.
    z: Math.cos(angle) * RADIUS - RADIUS,
    rotationY: -angle,
  };
}

/** 지금 그릴 판들. 먼 것부터 그려야 가까운 판이 위에 온다. */
export function visibleItems(widths: number[], scroll: number, gap = GAP): PlacedItem[] {
  const ring = buildRing(widths, gap);
  const items: PlacedItem[] = [];

  for (let index = 0; index < widths.length; index += 1) {
    const placed = placeItem(index, ring, widths, scroll);
    if (Math.abs(placed.offset) / RADIUS <= VISIBLE_ANGLE) items.push(placed);
  }

  return items.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
}

/** 지금 가운데에 온 판. 캡션이 이것을 따라간다. */
export function activeIndex(widths: number[], scroll: number, gap = GAP): number {
  if (!widths.length) return 0;
  return nearestIndex(buildRing(widths, gap), scroll);
}

/**
 * 이미지가 늦게 와서 폭이 바뀌어도 **보던 판이 그대로 가운데 있게** 한다.
 *
 * 폭이 바뀌면 고리 전체가 밀린다. 그대로 두면 첫 화면에 1번이 아니라 엉뚱한
 * 판이 서 있고, 보던 중이었다면 눈앞의 판이 옆으로 빠져나간다.
 * 실제로 그랬다(2026-09-10) — 열두 장이 다 로드되자 10번이 가운데였다.
 */
export function rebaseScroll(previous: Ring, next: Ring, scroll: number): number {
  if (previous.centers.length !== next.centers.length || !previous.centers.length) return scroll;

  const anchor = nearestIndex(previous, scroll);
  return scroll + ((next.centers[anchor] ?? 0) - (previous.centers[anchor] ?? 0));
}

/** 고리 위 이 자리에서 가장 가까운 판. 한 바퀴를 감아서 잰다. */
function nearestIndex(ring: Ring, scroll: number): number {
  let best = 0;
  let bestDistance = Infinity;

  for (let index = 0; index < ring.centers.length; index += 1) {
    const distance = Math.abs(wrapArc((ring.centers[index] ?? 0) - scroll, ring.total));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
