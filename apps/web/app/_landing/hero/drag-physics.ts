/**
 * 손으로 미는 느낌. **끌면 따라오고, 놓으면 미끄러지다 선다.**
 *
 * 「단순 롤링이 아니라 액티브하게」의 절반은 여기다. 나머지 절반(휘어짐)은
 * `wave.ts` 가 이 속도를 받아서 한다.
 *
 * 상태를 고쳐 쓰지 않고 **새 상태를 만들어 돌려준다.** 프레임마다 같은 객체를
 * 고쳐 쓰면 시험에서 「이전 값과 비교」를 못 한다.
 */

export interface DragState {
  /** 지금 가운데에 온 고리 위 자리(월드 단위 호 길이). */
  scroll: number;
  /** 초당 얼마나 흐르는가(월드 단위). */
  velocity: number;
  dragging: boolean;
}

export const INITIAL: DragState = { scroll: 0, velocity: 0, dragging: false };

/** 1초 뒤에 남는 속도 비율. 작을수록 빨리 선다. */
const FRICTION_PER_SECOND = 0.045;

/** 이보다 느리면 선 것으로 본다. 안 그러면 영원히 미세하게 흐른다. */
const REST_VELOCITY = 0.02;

/** 속도 상한. 세게 던져도 화면이 흰 띠가 되지 않게 한다. */
export const MAX_VELOCITY = 26;

/**
 * 화면에서 이만큼(px) 끌면 월드 1단위가 움직인다.
 *
 * 판이 **손끝을 그대로 따라오게** 맞춘 값이다. 카메라 거리 7.4, 화각 45°,
 * 높이 900px 이면 세로로 약 6.1 단위가 보인다 → 1 단위가 약 147px.
 */
const PIXELS_PER_UNIT = 147;

export function clampVelocity(v: number): number {
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}

/** 손가락이 움직인 픽셀을 거리로. 오른쪽으로 끌면 앞 이미지가 온다(음수). */
export function scrollDeltaFromPixels(dx: number): number {
  return -dx / PIXELS_PER_UNIT;
}

export function beginDrag(state: DragState): DragState {
  // 잡는 순간 미끄러짐을 끊는다. 안 그러면 손과 화면이 따로 논다.
  return { ...state, dragging: true, velocity: 0 };
}

/**
 * 끄는 중. 위치는 손을 그대로 따라가고, 속도는 **놓았을 때 쓰려고** 재 둔다.
 *
 * `dt` 가 0 이면 속도를 갱신하지 않는다 — 같은 프레임에 두 번 들어온 것이라
 * 나누면 무한대가 된다.
 */
export function dragBy(state: DragState, dx: number, dt: number): DragState {
  const delta = scrollDeltaFromPixels(dx);
  return {
    ...state,
    scroll: state.scroll + delta,
    velocity: dt > 0 ? clampVelocity(delta / dt) : state.velocity,
  };
}

export function endDrag(state: DragState): DragState {
  return { ...state, dragging: false };
}

/**
 * 한 프레임. 끄는 중에는 손이 위치를 정하므로 관성을 태우지 않는다.
 *
 * 감쇠를 프레임 수가 아니라 **시간**으로 계산한다. `v *= 0.95` 같은 식은
 * 120Hz 화면에서 두 배 빨리 선다.
 */
export function step(state: DragState, dt: number): DragState {
  if (dt <= 0) return state;

  /*
    잡은 채로 손을 멈추면 **물결도 잦아들어야 한다.**

    끄는 동안에는 위치를 손이 정하므로 관성을 태우지 않는다. 그런데 속도까지
    그대로 두면 마지막에 밀친 세기가 영원히 남아, 가만히 잡고 있는데 판이
    계속 출렁인다. 천을 쥐고 멈추면 천도 선다.
  */
  if (state.dragging) {
    const held = state.velocity * Math.pow(FRICTION_PER_SECOND, dt);
    return { ...state, velocity: Math.abs(held) < REST_VELOCITY ? 0 : held };
  }

  const velocity = state.velocity * Math.pow(FRICTION_PER_SECOND, dt);
  if (Math.abs(velocity) < REST_VELOCITY) {
    return { ...state, velocity: 0 };
  }
  return { ...state, scroll: state.scroll + velocity * dt, velocity };
}

/** 휠·트랙패드. 관성은 브라우저가 이미 넣어 주므로 위치만 민다. */
export function nudge(state: DragState, deltaPixels: number, dt: number): DragState {
  const delta = scrollDeltaFromPixels(-deltaPixels);
  return {
    ...state,
    scroll: state.scroll + delta,
    velocity: dt > 0 ? clampVelocity(delta / dt) : state.velocity,
  };
}
