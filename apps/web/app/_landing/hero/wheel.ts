/**
 * 휠을 **누가 받을 것인가.**
 *
 * 첫 화면에서는 휠이 캐러셀을 돌린다. 다만 **영원히 돌지는 않는다** — 몇 번
 * 돌려 본 뒤에는 페이지가 내려가야 한다. 안 그러면 마우스만 쓰는 사람은 첫
 * 화면에 갇히고, 아래에 무엇이 있는지 영영 모른다.
 *
 * 이 판단을 화면 안에 두면 값으로 못 잰다. 그런데 여기를 틀리면 **페이지가
 * 아예 안 내려가는 화면**(항상 가로채기)이나 **첫 화면이 그냥 지나가 버리는
 * 화면**(전혀 안 가로채기)이 된다. 둘 다 조용히 일어난다.
 */

/** 이만큼 돌리면 페이지에 넘긴다. 다섯 바퀴면 열두 장 중 여섯 장쯤을 본다. */
export const WHEEL_TURNS = 5;

/**
 * 한 바퀴로 치는 굴림량(px).
 *
 * 마우스 휠 한 칸이 보통 100~120px 이다. 트랙패드는 잘게 여러 번 보내므로
 * **이벤트 수가 아니라 굴린 거리**로 세야 둘이 비슷하게 동작한다.
 */
export const TURN_PIXELS = 140;

export interface WheelBudget {
  /** 지금까지 돌린 거리(px). */
  rolled: number;
}

export const FRESH_BUDGET: WheelBudget = { rolled: 0 };

/** 몇 바퀴 돌렸나. */
export function turnsSpent(budget: WheelBudget): number {
  return Math.floor(budget.rolled / TURN_PIXELS);
}

/** 굴린 만큼 더한다. 방향은 상관없다 — 어느 쪽으로 돌려도 한 바퀴는 한 바퀴다. */
export function addRoll(budget: WheelBudget, delta: number): WheelBudget {
  return { rolled: budget.rolled + Math.abs(delta) };
}

/**
 * 첫 화면으로 돌아오면 **다시 다섯 바퀴를 준다.**
 *
 * 한 번 써 버리면 끝인 화면은 「아까는 되던 게 왜 안 되지」가 된다.
 */
export function resetIfAtTop(budget: WheelBudget, scrollY: number): WheelBudget {
  return scrollY <= 0 ? FRESH_BUDGET : budget;
}

/**
 * 히어로가 화면을 차지하고 있고, 아직 바퀴가 남았을 때만 가로챈다.
 *
 * 절반을 기준으로 삼는다. 조금만 내려가도 놓아 버리면 손이 미끄러졌을 때
 * 화면이 튀고, 끝까지 붙잡으면 아래 내용으로 못 간다.
 */
export function shouldCaptureWheel(
  scrollY: number,
  heroHeight: number,
  budget: WheelBudget = FRESH_BUDGET,
): boolean {
  if (!(heroHeight > 0)) return false;
  if (scrollY >= heroHeight / 2) return false;
  return turnsSpent(budget) < WHEEL_TURNS;
}

/**
 * 세로·가로 중 **더 세게 민 쪽**을 쓴다.
 *
 * 일반 마우스는 세로만 보내고, 트랙패드는 둘 다 보낸다. 세로만 받으면
 * 트랙패드로 옆으로 쓸어도 안 움직이고, 가로만 받으면 마우스로는 아무것도
 * 못 한다.
 */
export function wheelDelta(deltaX: number, deltaY: number): number {
  return Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
}

/**
 * 맨 아래까지 내려왔는가. 「위로」 버튼을 낼지 정한다.
 *
 * 딱 끝일 때만 내면 스크롤 관성 때문에 깜빡인다. 한 화면의 4분의 1쯤 남았을
 * 때부터 낸다.
 */
export function shouldShowBackToTop(
  scrollY: number,
  viewportHeight: number,
  documentHeight: number,
): boolean {
  if (!(viewportHeight > 0) || !(documentHeight > viewportHeight)) return false;
  const remaining = documentHeight - (scrollY + viewportHeight);
  return remaining <= viewportHeight / 4;
}
