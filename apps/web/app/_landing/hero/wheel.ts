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

/**
 * 이만큼 **넘겨 본 뒤에** 페이지에 넘긴다.
 *
 * 처음엔 「휠 다섯 바퀴」로 셌는데, 한 바퀴에 한 장도 안 넘어가서 두세 장 보고
 * 화면이 내려가 버렸다. 사람이 세는 것은 바퀴가 아니라 **넘어간 장**이다.
 */
export const SLIDES_BEFORE_RELEASE = 4;

/**
 * 고리 위를 이만큼 움직였으면 몇 장을 넘긴 것인가.
 *
 * 판마다 폭이 달라(1:1 · 9:16 · 16:9) 한 장이 몇 단위인지 고정할 수 없다.
 * 한 바퀴 길이를 장수로 나눠 **평균 한 장**을 구한다.
 */
export function slidesTraveled(distance: number, ringTotal: number, slideCount: number): number {
  if (!(ringTotal > 0) || !(slideCount > 0)) return 0;
  const perSlide = ringTotal / slideCount;
  return Math.abs(distance) / perSlide;
}

/**
 * 첫 화면에서 휠을 받을 것인가.
 *
 * 히어로가 화면을 차지하고 있고, 아직 넘겨 볼 장이 남았을 때만 받는다.
 * 절반을 기준으로 삼는다 — 조금만 내려가도 놓아 버리면 손이 미끄러졌을 때
 * 화면이 튀고, 끝까지 붙잡으면 아래 내용으로 못 간다.
 */
export function shouldCaptureWheel(
  scrollY: number,
  heroHeight: number,
  slidesSeen = 0,
): boolean {
  if (!(heroHeight > 0)) return false;
  if (scrollY >= heroHeight / 2) return false;
  return slidesSeen < SLIDES_BEFORE_RELEASE;
}

/**
 * 첫 화면으로 돌아왔는가. 돌아왔으면 **다시 처음부터 넘겨 볼 수 있다.**
 *
 * 한 번 써 버리면 끝인 화면은 「아까는 되던 게 왜 안 되지」가 된다.
 */
export function isBackAtTop(scrollY: number): boolean {
  return scrollY <= 0;
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
