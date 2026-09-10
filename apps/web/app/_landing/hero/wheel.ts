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
 *
 * **미는 양에 배율을 곱하지 않는다.** 한 번 해 봤는데 두 배로 해도 실제로
 * 가는 거리는 9% 밖에 안 늘었다 — 굴렸을 때의 거리는 미는 순간이 아니라
 * **놓은 뒤 미끄러지는 거리**가 정하고, 그 속도가 이미 상한에 걸려 있었기
 * 때문이다. 손잡이는 `drag-physics.ts` 의 `WHEEL_MAX_VELOCITY` 하나다.
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
 * 마우스 휠 **한 칸이 화면의 몇 분의 몇**을 지나갈까.
 *
 * 값을 바꿀 일이 생기면 여기 한 줄이다. 0.4 면 두 칸 반에 한 화면이다.
 *
 * ── 두 번 잘못 짚었다 ────────────────────────────────────────────
 * ① `deltaY × 2.4` — **마우스마다 갈렸다.** 크롬은 한 칸에 보통 100 을 보내는데
 *    윈도의 「한 번에 스크롤할 줄 수」를 1 로 둔 마우스는 33 쯤을 보낸다. 그
 *    사람은 79px 밖에 안 내려갔다.
 * ② 고정 260px — **화면 크기에 따라 갈렸다.** 노트북에서는 화면의 3분의 1인데
 *    큰 모니터에서는 5분의 1이라 같은 값이 다르게 느껴진다.
 *
 * 그래서 **칸을 세고, 화면에 비례한 거리를 준다.** 어느 마우스, 어느 모니터든
 * 한 칸이 화면의 같은 만큼을 지나간다.
 */
export const WHEEL_SCREEN_RATIO = 0.4;

/**
 * 크롬이 마우스 한 칸에 보내는 값. **「한 칸」을 세는 기준자다.**
 *
 * 이 값으로 나눠 몇 칸인지 센다. 33 을 보내는 마우스는 0.33 → 한 칸으로 올리고,
 * 두 칸을 한 번에 보내는 마우스(200)는 두 칸으로 센다. 그래야 큰 값을 보내는
 * 마우스가 바닥에 묶여 느려지지 않는다.
 */
export const WHEEL_NOTCH = 100;

/**
 * 이보다 작은 델타는 **트랙패드·정밀 휠**로 본다. 브라우저에 맡긴다.
 *
 * 하한을 40 에서 내렸다. 40 은 「한 줄」 마우스(33)를 함께 걸러냈다.
 */
export const MOUSE_WHEEL_MIN = 12;

/**
 * 앞 휠에서 이보다 촘촘히 오면 **흐르는 입력**으로 본다. 손대지 않는다.
 *
 * 트랙패드는 손가락 한 번에 60Hz(약 16ms)로 잔 값을 흘려보낸다. 거기에 한 칸을
 * 통째로 주면 화면이 날아간다. 마우스 휠은 손으로 굴리는 것이라 한 칸 사이가
 * 이보다 넓다.
 */
export const WHEEL_STREAM_MS = 25;

/**
 * 이 휠을 우리가 더 내려 줄까. 0 이면 **브라우저에 맡긴다.**
 *
 * 맡기는 쪽이 기본이다 — 스크롤을 가로채는 것은 트랙패드·확대·접근성 도구를
 * 망가뜨리기 쉬운 일이라, 확실히 마우스 휠인 경우만 손을 댄다. 0 을 돌려주면
 * `preventDefault` 를 부르지 않으므로 **브라우저가 제 몫을 그대로 한다** —
 * 아무것도 잃지 않는다.
 */
export function boostedWheel(event: {
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  /** 앞 휠에서 지난 시간(ms). 첫 휠이면 큰 값을 준다. */
  sinceLast: number;
  /** 화면 높이(px). 한 칸의 거리가 여기에 비례한다. */
  viewport: number;
}): number {
  // 첫 화면 캐러셀이 이미 가로챘다. 거기서는 휠이 페이지를 내리는 게 아니다.
  if (event.defaultPrevented) return 0;
  // 확대·축소다. 건드리면 안 된다.
  if (event.ctrlKey) return 0;
  // 픽셀 단위로 오는 것만 다룬다. 줄·장 단위(옛 브라우저)는 맡긴다.
  if (event.deltaMode !== 0) return 0;
  if (Math.abs(event.deltaY) < MOUSE_WHEEL_MIN) return 0;
  // 흐르는 입력(트랙패드)이다.
  if (event.sinceLast < WHEEL_STREAM_MS) return 0;
  // 화면 높이를 모르면 손대지 않는다. 엉뚱한 거리를 내는 것보다 낫다.
  if (!(event.viewport > 0)) return 0;

  const notches = Math.max(1, Math.round(Math.abs(event.deltaY) / WHEEL_NOTCH));
  return Math.sign(event.deltaY) * notches * event.viewport * WHEEL_SCREEN_RATIO;
}

/**
 * 한 손짓이 이어지는 것으로 볼 시간(ms).
 *
 * 이보다 오래 쉬었으면 **새 손짓**이라 지금 화면에서 다시 센다. 이어지는
 * 동안에는 앞의 목표에 더한다.
 */
export const WHEEL_GESTURE_MS = 250;

/**
 * 다음에 멈출 자리. **거리를 쌓는다.**
 *
 * 처음에는 `scrollBy({ behavior: "smooth" })` 를 썼는데 그게 잘못이었다.
 * 그 함수는 **지금 위치**에서 재고, 새 부드러운 스크롤은 앞의 것을 **취소**한다.
 * 그래서 연속으로 굴리면 남은 거리가 버려진다 —
 *
 *   한 칸: 1000 → 1240 으로 간다
 *   두 칸(움직이는 중, 지금 1080): 1080+240 = 1320. 남았던 160 이 사라진다
 *   세 칸(지금 1150): 1390
 *
 * 세 칸을 굴렸는데 390 밖에 안 간다. **기본 동작보다 못하다** — 브라우저는
 * 제대로 쌓는다. 그래서 목표를 우리가 들고 절대 위치로 보낸다.
 */
export function nextWheelTarget(input: {
  /** 지금 스크롤 위치. */
  current: number;
  /** 앞서 정한 목표. 없으면 `null`. */
  target: number | null;
  /** 앞 휠에서 지난 시간(ms). */
  sinceLast: number;
  /** 이번 휠이 옮길 거리. */
  distance: number;
  /** 문서 끝. 이보다 더 내려갈 수 없다. */
  max: number;
}): number {
  const { current, target, sinceLast, distance, max } = input;
  // 쉬었다가 다시 굴리면 새 손짓이다. 화면 밖으로 달아난 목표를 이어받지 않는다.
  const base = target !== null && sinceLast <= WHEEL_GESTURE_MS ? target : current;
  return Math.min(Math.max(base + distance, 0), Math.max(max, 0));
}
