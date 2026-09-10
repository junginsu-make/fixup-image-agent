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
 * 첫 화면에서 휠을 받을 것인가.
 *
 * **히어로가 화면을 차지하는 동안에는 늘 받는다.** 여기서 페이지를 내리는
 * 길은 아래의 손잡이(∨) 하나뿐이다.
 *
 * 한때 「몇 장 보면 놓아 준다」를 넣어 봤는데 두 번 다 잘못이었다. 바퀴로 세면
 * 두세 장 만에 화면이 내려가 버렸고, 장으로 세도 한 바퀴를 못 돌고 끊겼다.
 * 첫 화면은 **머무는 자리**다. 내려갈 때는 사람이 스스로 정한다.
 *
 * 절반을 기준으로 삼는다 — 조금만 내려가도 놓아 버리면 손이 미끄러졌을 때
 * 화면이 튀고, 끝까지 붙잡으면 아래 내용으로 못 간다.
 */
export function shouldCaptureWheel(scrollY: number, heroHeight: number): boolean {
  if (!(heroHeight > 0)) return false;
  return scrollY < heroHeight / 2;
}

/**
 * 휠 한 칸이 손가락 몇 px 어치인가.
 *
 * 끌기는 판이 **손끝을 그대로 따라오는** 것이 맞다 — 1px 끌면 1px 간다. 그런데
 * 휠은 손끝이 아니다. 한 칸이 120px 이고 월드 1단위가 147px 이라, 그대로 쓰면
 * 한 칸에 판 하나의 4분의 1쯤 간다. **그림 하나 넘기는 데 네 칸**이라 굴려도
 * 굴려도 제자리인 느낌이 든다.
 *
 * 두 배로 두면 한 칸에 판의 절반, **두 칸에 그림 하나**가 된다.
 *
 * 더 올리지 않는 이유는 물결이다. 미는 속도가 휘어짐을 정하는데 이미 상한
 * (`MAX_VELOCITY`)에 닿아 있어서, 더 키우면 위치만 빨라지고 물결은 그대로다 —
 * 그림이 미끄러지듯 지나가 버린다.
 */
export const WHEEL_GAIN = 2;

/**
 * 세로·가로 중 **더 세게 민 쪽**을 쓴다.
 *
 * 일반 마우스는 세로만 보내고, 트랙패드는 둘 다 보낸다. 세로만 받으면
 * 트랙패드로 옆으로 쓸어도 안 움직이고, 가로만 받으면 마우스로는 아무것도
 * 못 한다.
 */
export function wheelDelta(deltaX: number, deltaY: number): number {
  const stronger = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  return stronger * WHEEL_GAIN;
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
