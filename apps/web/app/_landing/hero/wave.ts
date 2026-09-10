/**
 * **물결.** 이 프로토타입의 핵심이다.
 *
 * 천을 잡고 흔드는 것과 같다 — 손이 빠르면 물결이 크고, 멈추면 잦아든다.
 * 판을 평평한 사각형이 아니라 잘게 쪼갠 그물로 만들어 두고, 여기서 정한
 * 세기를 셰이더에 넘겨 정점을 앞뒤로 민다.
 *
 * 세기 계산을 셰이더 안에 묻지 않는 이유는 하나다 — **GLSL 은 시험으로 못
 * 잰다.** 얼마나 휠지는 여기서 정하고, 셰이더는 받은 값대로 밀기만 한다.
 */

/**
 * 속도 1단위/초당 휘어지는 정도.
 *
 * 「지금보다 세게」 요청으로 올린 값이다(2026-09-10). 이 값만 키우면 빠를 때만
 * 세지므로, 느리게 끌 때도 반응이 보이도록 `MIN_FELT_BEND` 를 함께 둔다.
 */
const BEND_PER_VELOCITY = 0.135;

/** 조금만 움직여도 이만큼은 인다. 살짝 끌었을 때 「아무 일도 없다」를 막는다. */
const MIN_FELT_BEND = 0.2;

/**
 * 아무리 빨라도 이 이상은 안 휜다. 넘으면 판이 접혀 뒤집힌다.
 *
 * 「더 심하게」 요청으로 두 번 올린 값이다(2026-09-10). 판 높이가 3.1 이니
 * 이 값이 그 절반을 넘어가면 앞뒤로 뒤집히기 시작한다.
 */
export const MAX_BEND = 2.4;

/** 물결이 잦아드는 빠르기(1초 뒤 남는 비율). 속도보다 늦게 풀려야 여운이 남는다. */
const RELAX_PER_SECOND = 0.12;

/** 가만히 있어도 아주 약하게 숨 쉰다. 완전히 굳으면 죽은 화면으로 보인다. */
export const IDLE_AMPLITUDE = 0.02;

/**
 * 지금 속도가 부르는 휘어짐. 방향까지 남긴다 — 왼쪽으로 던지면 왼쪽으로 휜다.
 */
export function targetBend(velocity: number): number {
  if (velocity === 0) return 0;
  const direction = Math.sign(velocity);
  // 움직이기 시작하면 곧바로 최소한의 물결이 인다. 그 위로 속도에 비례해 커진다.
  const raw = direction * (MIN_FELT_BEND + Math.abs(velocity) * BEND_PER_VELOCITY);
  return Math.max(-MAX_BEND, Math.min(MAX_BEND, raw));
}

/**
 * 목표까지 **따라붙되 늦게 따라붙는다.** 속도를 그대로 쓰면 손을 놓는 순간
 * 물결이 뚝 끊긴다. 실제 천은 손이 멈춰도 잠깐 더 출렁인다.
 */
export function relaxBend(current: number, velocity: number, dt: number): number {
  if (dt <= 0) return current;
  const target = targetBend(velocity);
  const keep = Math.pow(RELAX_PER_SECOND, dt);
  return target + (current - target) * keep;
}

/**
 * 판 안의 한 점이 **고리 위 어디인가.**
 *
 * 물결을 판 안 좌표(−0.5~0.5)로 계산하면 판마다 파형이 처음부터 다시
 * 시작한다 — 열두 장이 각각 흔들리는 필름 프레임처럼 보인다. 실제로 그랬다
 * (2026-09-10).
 *
 * 고리 위 절대 위치로 재면 파도가 **이미지 경계를 넘어 이어진다.** 열두 장이
 * 이어 붙은 한 장의 긴 천이 된다.
 */
export function worldXOf(arcOffset: number, localX: number, width: number): number {
  return arcOffset + localX * width;
}

/** 물결의 촘촘함(월드 1단위당 파장 수). 셰이더와 이 값을 함께 쓴다. */
export const WAVE_FREQUENCY = 0.48;

/** 겹쳐 쓰는 잔물결. 파장이 달라야 골판지처럼 안 보인다. */
export const RIPPLE_FREQUENCY = 1.15;

/** 물결이 천을 따라 흐르는 빠르기. */
export const WAVE_SPEED = 1.9;

/** 가운데에서 멀수록 더 휜다. 이 기울기로 부드럽게 커진다. */
export const FALLOFF_PER_UNIT = 0.055;

/** 아무리 멀어도 이 배를 넘지 않는다. */
export const MAX_FALLOFF = 1.9;

/**
 * 움직임을 원하지 않는 사람에게는 **물결을 끈다.**
 *
 * 끄되 캐러셀 자체는 남긴다 — 못 쓰게 만드는 것과 조용하게 만드는 것은 다르다.
 */
export function bendWhenReducedMotion(): number {
  return 0;
}
