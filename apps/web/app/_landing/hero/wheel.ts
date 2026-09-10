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

/* ── 휠 한 칸이 얼마나 내려갈까 ─────────────────────────────────── */

/**
 * 브라우저 기본은 한 칸에 100px 안팎이다. 이 화면은 섹션이 크고 사이가
 * 넓어서(`.mcs-section` 이 위아래로 최대 208px씩) 한 칸이 «거의 안 움직인다»로
 * 느껴진다(2026-09-10 사용자 신고).
 *
 * 배수만 둔다. 값을 바꿀 일이 생기면 여기 한 줄이다.
 */
export const WHEEL_BOOST = 2.4;

/**
 * 이보다 작은 델타는 **트랙패드**로 본다.
 *
 * 트랙패드는 손가락 한 번에 잔 델타를 수십 번 보낸다. 거기에 배수를 곱하면
 * 화면이 날아간다. 마우스 휠은 한 칸에 100 안팎을 한 번 보낸다.
 */
export const MOUSE_WHEEL_MIN = 40;

/**
 * 이 휠을 우리가 더 내려 줄까. 0 이면 **브라우저에 맡긴다.**
 *
 * 맡기는 쪽이 기본이다 — 스크롤을 가로채는 것은 트랙패드·확대·접근성 도구를
 * 망가뜨리기 쉬운 일이라, 확실히 마우스 휠인 경우만 손을 댄다.
 */
export function boostedWheel(event: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
}): number {
  // 첫 화면 캐러셀이 이미 가로챘다. 거기서는 휠이 페이지를 내리는 게 아니다.
  if (event.defaultPrevented) return 0;
  // 확대·축소다. 건드리면 안 된다.
  if (event.ctrlKey) return 0;
  // 픽셀 단위로 오는 것만 다룬다. 줄·장 단위(옛 브라우저)는 맡긴다.
  if (event.deltaMode !== 0) return 0;
  if (Math.abs(event.deltaY) < MOUSE_WHEEL_MIN) return 0;
  return event.deltaY * WHEEL_BOOST;
}
