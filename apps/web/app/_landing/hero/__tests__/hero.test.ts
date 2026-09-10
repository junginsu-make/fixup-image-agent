import { describe, expect, it } from "vitest";
import {
  GAP,
  RADIUS,
  activeIndex,
  buildRing,
  placeItem,
  rebaseScroll,
  visibleItems,
  wrapArc,
} from "../arc-layout";
import {
  INITIAL,
  MAX_VELOCITY,
  WHEEL_MAX_VELOCITY,
  beginDrag,
  clampVelocity,
  dragBy,
  endDrag,
  nudge,
  scrollDeltaFromPixels,
  step,
} from "../drag-physics";
import { IDLE_AMPLITUDE, MAX_BEND, relaxBend, targetBend, worldXOf } from "../wave";
import { downScrollBlock, downScrollOptions, scrollBehaviorFor } from "../scroll-down";
import {
  MOUSE_WHEEL_MIN,
  WHEEL_GESTURE_MS,
  WHEEL_NOTCH,
  WHEEL_SCREEN_RATIO,
  WHEEL_STREAM_MAX_DELTA,
  WHEEL_STREAM_MS,
  boostedWheel,
  nextWheelTarget,
  shouldCaptureWheel,
  shouldShowBackToTop,
  wheelDelta,
} from "../wheel";

/**
 * 화면은 눈으로 보지만 **판단은 값으로 잰다.**
 *
 * 캔버스 안에 계산을 묻어 두면 「가운데가 한 칸 어긋났다」·「끝에서 처음으로
 * 넘어갈 때 판이 날아간다」 같은 것을 아무도 못 잡는다.
 */

/** 9:16 · 1:1 · 16:9 를 섞는다. 높이 3.1 을 기준으로 한 가로 길이. */
const 세로 = 1.74;
const 정사각 = 3.1;
const 가로 = 5.51;

describe("고리 만들기", () => {
  it("판이 제 폭만큼 자리를 차지한다", () => {
    const { centers, total } = buildRing([2, 4], 1);

    // 첫 판(폭2)의 중심은 1. 다음 판은 2+1(틈) 부터 시작하니 중심이 3+2=5.
    expect(centers).toEqual([1, 5]);
    expect(total).toBe(8);
  });

  /** 폭을 무시하고 칸을 똑같이 나누면 세로 그림 옆에 틈이 벌고 가로 그림이 겹친다. */
  it("이웃한 판은 딱 틈만큼 떨어진다", () => {
    const widths = [세로, 정사각, 가로, 세로];
    const { centers } = buildRing(widths, GAP);

    for (let i = 1; i < widths.length; i += 1) {
      const 사이 = centers[i]! - centers[i - 1]! - widths[i]! / 2 - widths[i - 1]! / 2;
      expect(사이).toBeCloseTo(GAP);
    }
  });

  it("가로로 긴 판은 더 넓은 자리를 가져간다", () => {
    const 좁은고리 = buildRing([세로, 세로], GAP);
    const 넓은고리 = buildRing([가로, 가로], GAP);

    expect(넓은고리.total).toBeGreaterThan(좁은고리.total);
  });
});

describe("고리 위 배치", () => {
  const widths = [세로, 정사각, 가로, 세로];

  it("가운데 판은 정면에 선다", () => {
    const ring = buildRing(widths, GAP);
    const placed = placeItem(0, ring, widths, ring.centers[0]!);

    expect(placed.x).toBeCloseTo(0);
    expect(placed.z).toBeCloseTo(0);
    expect(placed.rotationY).toBeCloseTo(0);
  });

  it("오른쪽 판은 오른쪽에, 안쪽으로 돌아간다", () => {
    const ring = buildRing(widths, GAP);
    const right = placeItem(1, ring, widths, ring.centers[0]!);

    expect(right.x).toBeGreaterThan(0);
    // 원통 안쪽이므로 옆으로 갈수록 뒤로 물러난다.
    expect(right.z).toBeLessThan(0);
    expect(right.rotationY).toBeLessThan(0);
  });

  /** 반지름이 크면 같은 거리를 가도 덜 돈다. 각도는 호 길이 ÷ 반지름이다. */
  it("도는 각도는 호 길이를 반지름으로 나눈 값이다", () => {
    const ring = buildRing(widths, GAP);
    const placed = placeItem(1, ring, widths, ring.centers[0]!);

    expect(placed.rotationY).toBeCloseTo(-placed.offset / RADIUS);
  });

  /** 끝에서 처음으로 넘어갈 때 판이 반대편으로 날아가면 안 된다. */
  it("마지막 다음은 처음이다 — 가까운 쪽으로 감는다", () => {
    expect(wrapArc(9, 10)).toBeCloseTo(-1);
    expect(wrapArc(-9, 10)).toBeCloseTo(1);
    expect(wrapArc(11, 10)).toBeCloseTo(1);
  });

  it("한 바퀴가 0이면 계산하지 않는다", () => {
    expect(wrapArc(3, 0)).toBe(0);
  });

  it("먼 판은 안 그린다", () => {
    const many = Array.from({ length: 30 }, () => 세로);
    const shown = visibleItems(many, 0, GAP);

    expect(shown.length).toBeGreaterThan(2);
    expect(shown.length).toBeLessThan(30);
  });

  /** 먼 것을 먼저 그려야 가까운 판이 위에 온다. */
  it("먼 것부터 그리도록 정렬한다", () => {
    const shown = visibleItems([세로, 정사각, 가로, 세로, 정사각, 가로], 0, GAP);
    const distances = shown.map((item) => Math.abs(item.offset));

    expect(distances).toEqual([...distances].sort((a, b) => b - a));
  });

  it("판마다 제 가로를 들고 다닌다", () => {
    const shown = visibleItems(widths, 0, GAP);
    expect(shown.find((item) => item.index === 2)?.width).toBeCloseTo(가로);
  });
});

describe("폭이 바뀌어도 보던 판이 가운데 남는다", () => {
  /**
   * 이미지는 늦게 도착한다. 다 오면 폭이 바뀌고 고리가 통째로 밀린다.
   * 그대로 두면 첫 화면에 1번이 아니라 10번이 서 있었다(실제로 그랬다).
   */
  it("이미지가 늦게 와도 첫 판이 그대로 첫 판이다", () => {
    const 임시 = buildRing(Array.from({ length: 12 }, () => 2.3), GAP);
    const 진짜 = buildRing([세로, 정사각, 가로, 세로, 정사각, 가로, 세로, 정사각, 가로, 세로, 정사각, 가로], GAP);

    const scroll = rebaseScroll(임시, 진짜, 임시.centers[0]!);
    expect(scroll).toBeCloseTo(진짜.centers[0]!);
  });

  it("보던 판이 세 번째였으면 세 번째가 남는다", () => {
    const 임시 = buildRing([2.3, 2.3, 2.3, 2.3], GAP);
    const 진짜 = buildRing([세로, 정사각, 가로, 세로], GAP);

    const scroll = rebaseScroll(임시, 진짜, 임시.centers[2]!);
    expect(scroll).toBeCloseTo(진짜.centers[2]!);
  });

  it("장수가 달라지면 손대지 않는다", () => {
    expect(rebaseScroll(buildRing([2, 2], GAP), buildRing([2, 2, 2], GAP), 5)).toBe(5);
    expect(rebaseScroll(buildRing([], GAP), buildRing([], GAP), 5)).toBe(5);
  });
});

describe("지금 가운데에 온 판", () => {
  const widths = [세로, 정사각, 가로, 세로];

  it("스크롤이 그 판의 중심에 있으면 그 판이다", () => {
    const ring = buildRing(widths, GAP);
    expect(activeIndex(widths, ring.centers[2]!, GAP)).toBe(2);
  });

  it("조금 지나쳐도 가장 가까운 판을 고른다", () => {
    const ring = buildRing(widths, GAP);
    expect(activeIndex(widths, ring.centers[1]! + 0.2, GAP)).toBe(1);
  });

  it("장이 없으면 0 이다", () => {
    expect(activeIndex([], 5, GAP)).toBe(0);
  });
});

describe("끌기와 관성", () => {
  it("오른쪽으로 끌면 앞 이미지가 온다", () => {
    expect(scrollDeltaFromPixels(320)).toBeLessThan(0);
    expect(scrollDeltaFromPixels(-320)).toBeGreaterThan(0);
  });

  it("잡는 순간 미끄러짐이 끊긴다", () => {
    const flying = { scroll: 2, velocity: 8, dragging: false };
    expect(beginDrag(flying).velocity).toBe(0);
    expect(beginDrag(flying).dragging).toBe(true);
  });

  it("끄는 동안에는 손이 위치를 정한다 — 관성이 안 겹친다", () => {
    const dragging = { scroll: 1, velocity: 5, dragging: true };
    expect(step(dragging, 0.016).scroll).toBe(1);
  });

  /** 잡은 채로 멈추면 물결도 잦아들어야 한다. 천을 쥐고 멈추면 천도 선다. */
  it("잡은 채로 멈추면 속도가 죽는다", () => {
    let state = { scroll: 1, velocity: 8, dragging: true };

    // 반 초면 이미 눈에 안 띌 만큼 잦아든다.
    for (let i = 0; i < 30; i += 1) state = step(state, 1 / 60);
    expect(Math.abs(state.velocity)).toBeLessThan(2);

    for (let i = 0; i < 90; i += 1) state = step(state, 1 / 60);
    expect(state.velocity).toBe(0);
    // 위치는 손이 정한다 — 잡고 있는 동안 저절로 흐르지 않는다.
    expect(state.scroll).toBe(1);
  });

  it("놓으면 미끄러지다 선다", () => {
    let state = endDrag({ scroll: 0, velocity: 6, dragging: true });
    for (let i = 0; i < 400; i += 1) state = step(state, 1 / 60);

    expect(state.velocity).toBe(0);
    expect(state.scroll).toBeGreaterThan(0);
  });

  /**
   * 감쇠를 시간으로 계산해야 한다. 프레임 수로 하면 120Hz 화면에서 두 배
   * 빨리 서서, 좋은 모니터를 쓸수록 손맛이 달라진다.
   */
  it("화면 주사율이 달라도 같은 거리를 간다", () => {
    const run = (fps: number) => {
      let state = endDrag({ scroll: 0, velocity: 6, dragging: true });
      for (let i = 0; i < fps * 4; i += 1) state = step(state, 1 / fps);
      return state.scroll;
    };

    expect(run(120)).toBeCloseTo(run(60), 1);
  });

  it("세게 던져도 상한을 넘지 않는다", () => {
    const thrown = dragBy(beginDrag(INITIAL), -9999, 1 / 60);
    expect(Math.abs(thrown.velocity)).toBeLessThanOrEqual(MAX_VELOCITY);
    expect(clampVelocity(1e6)).toBe(MAX_VELOCITY);
  });

  /** 같은 프레임에 두 번 들어오면 0 으로 나누게 된다. */
  it("시간이 0이면 속도를 안 건드린다", () => {
    const state = { scroll: 0, velocity: 3, dragging: true };
    expect(dragBy(state, 50, 0).velocity).toBe(3);
    expect(nudge(state, 50, 0).velocity).toBe(3);
  });

  it("휠도 같은 방향으로 민다", () => {
    const rolled = nudge(INITIAL, -320, 1 / 60);
    expect(rolled.scroll).toBeLessThan(0);
  });
});

describe("물결", () => {
  it("빠를수록 크게 휜다", () => {
    expect(targetBend(6)).toBeGreaterThan(targetBend(2));
  });

  it("던진 방향으로 휜다", () => {
    expect(targetBend(-4)).toBeLessThan(0);
    expect(targetBend(4)).toBeGreaterThan(0);
  });

  /** 넘으면 판이 접혀 뒤집힌다. */
  it("아무리 빨라도 접히지 않는다", () => {
    expect(targetBend(9999)).toBeLessThanOrEqual(MAX_BEND);
    expect(targetBend(-9999)).toBeGreaterThanOrEqual(-MAX_BEND);
  });

  it("멈추면 잦아든다", () => {
    let bend = 0.5;
    for (let i = 0; i < 180; i += 1) bend = relaxBend(bend, 0, 1 / 60);
    expect(Math.abs(bend)).toBeLessThan(0.01);
  });

  /**
   * 손을 놓는 순간 물결이 뚝 끊기면 안 된다. 실제 천은 잠깐 더 출렁인다.
   */
  it("속도가 0이 된 다음 프레임에도 아직 출렁인다", () => {
    const after = relaxBend(0.5, 0, 1 / 60);
    expect(after).toBeGreaterThan(0.1);
    expect(after).toBeLessThan(0.5);
  });

  /**
   * 물결이 **이미지 경계를 넘어 이어져야** 한다. 판 안 좌표로 계산하면 판마다
   * 파형이 처음부터 다시 시작해 필름 프레임 열두 개가 각각 흔들린다.
   */
  it("맞닿은 두 판의 경계에서 같은 자리가 된다", () => {
    const 왼쪽폭 = 2;
    const 오른쪽폭 = 4;
    // 틈 없이 붙은 두 판. 왼쪽 중심 -1, 오른쪽 중심 +2.
    const 왼쪽오른끝 = worldXOf(-1, 0.5, 왼쪽폭);
    const 오른쪽왼끝 = worldXOf(2, -0.5, 오른쪽폭);

    expect(왼쪽오른끝).toBeCloseTo(오른쪽왼끝);
  });

  it("판이 달라도 같은 자리면 같은 값이다", () => {
    // 폭이 전혀 다른 두 판이 우연히 같은 지점을 덮어도 결과가 같아야 한다.
    expect(worldXOf(0, 0.25, 4)).toBeCloseTo(worldXOf(2, -0.25, 4));
  });

  it("판 안 좌표가 아니라 고리 위 자리를 돌려준다", () => {
    expect(worldXOf(5, 0, 3)).toBe(5);
    expect(worldXOf(5, 0.5, 3)).toBe(6.5);
    expect(worldXOf(-5, -0.5, 3)).toBe(-6.5);
  });

  it("가만히 있어도 아주 약하게 숨 쉰다", () => {
    expect(IDLE_AMPLITUDE).toBeGreaterThan(0);
    expect(IDLE_AMPLITUDE).toBeLessThan(0.05);
  });
});

describe("내려가기", () => {
  it("보통은 부드럽게 내려간다", () => {
    expect(scrollBehaviorFor(false)).toBe("smooth");
  });

  /** 움직임을 원하지 않는 사람에게 부드러운 스크롤은 그 자체가 멀미다. */
  it("움직임을 줄이라고 했으면 즉시 내려간다", () => {
    expect(scrollBehaviorFor(true)).toBe("auto");
  });

  /**
   * `start` 는 다음 섹션의 **위쪽**을 화면 위쪽에 붙인다. 그 섹션은 위아래로
   * `clamp(104px, 13vh, 208px)` 씩 여백을 두고 있어서, 그렇게 붙이면 빈 여백이
   * 화면을 채우고 글은 한참 아래에 걸렸다(2026-09-10 사용자 신고).
   */
  it("글이 화면 가운데 오게 멈춘다", () => {
    expect(downScrollBlock()).toBe("center");
  });

  it("손잡이가 값을 조립하지 않는다 — 한 벌로 받는다", () => {
    expect(downScrollOptions(false)).toEqual({ behavior: "smooth", block: "center" });
    expect(downScrollOptions(true)).toEqual({ behavior: "auto", block: "center" });
  });
});

describe("휠을 누가 받는가", () => {
  const 히어로높이 = 900;

  it("첫 화면에서는 캐러셀이 받는다", () => {
    expect(shouldCaptureWheel(0, 히어로높이)).toBe(true);
    expect(shouldCaptureWheel(120, 히어로높이)).toBe(true);
  });

  /** 끝까지 붙잡으면 아래 내용으로 영영 못 간다. */
  it("절반 넘게 내려가면 페이지에 넘긴다", () => {
    expect(shouldCaptureWheel(500, 히어로높이)).toBe(false);
    expect(shouldCaptureWheel(2000, 히어로높이)).toBe(false);
  });

  it("높이를 모르면 가로채지 않는다", () => {
    expect(shouldCaptureWheel(0, 0)).toBe(false);
  });

  /**
   * 첫 화면은 **머무는 자리**다. 휠로는 안 내려간다 — 내려가는 길은 아래의
   * 손잡이 하나뿐이다.
   *
   * 「몇 장 보면 놓아 준다」를 두 번 넣어 봤다가 두 번 다 걷어냈다. 바퀴로 세면
   * 두세 장 만에 내려가 버렸고, 장으로 세도 한 바퀴를 못 돌고 끊겼다.
   */
  it("첫 화면에 머무는 동안에는 늘 캐러셀이 받는다", () => {
    expect(shouldCaptureWheel(0, 히어로높이)).toBe(true);
    expect(shouldCaptureWheel(120, 히어로높이)).toBe(true);
    expect(shouldCaptureWheel(히어로높이 / 2 - 1, 히어로높이)).toBe(true);
  });

  it("더 세게 민 쪽을 쓴다", () => {
    // 일반 마우스는 세로만 보낸다.
    expect(wheelDelta(0, 120)).toBe(120);
    // 트랙패드로 옆으로 쓸면 가로가 이긴다.
    expect(wheelDelta(-80, 12)).toBe(-80);
  });

  it("아래로 굴리면 다음 그림 쪽으로 간다", () => {
    const 굴린뒤 = nudge(INITIAL, wheelDelta(0, 120), 1 / 60);
    expect(굴린뒤.scroll).toBeGreaterThan(0);
  });

  /**
   * **한 칸 굴리면 그림 몇 장이 지나가는가.** 이게 굴렸을 때의 느낌 그 자체다.
   *
   * 미는 순간의 이동만 재면 안 된다 — 굴렸을 때 가는 거리는 **놓은 뒤
   * 미끄러지는 거리**가 거의 다 정하기 때문이다. 실제로 미는 양을 두 배로
   * 했을 때 총 거리는 9% 밖에 안 늘었다(속도가 상한에 걸려 있었다). 재는
   * 자리를 잘못 잡으면 아무것도 안 고치고 고쳤다고 믿게 된다.
   */
  it("한 칸 굴리면 그림 서너 장이 지나간다", () => {
    const 판하나 = 정사각 + GAP;

    let state = nudge(INITIAL, wheelDelta(0, 120), 1 / 60); // 윈도우 크롬의 한 칸
    for (let f = 0; f < 600; f += 1) state = step(state, 1 / 60); // 설 때까지

    const 장수 = state.scroll / 판하나;
    expect(장수).toBeGreaterThan(3);
    expect(장수).toBeLessThan(4.5);
  });

  /** 휠은 끌기보다 멀리 간다. 한 번 굴리고 손을 떼기 때문이다. */
  it("휠의 속도 상한이 끌기보다 높다", () => {
    expect(WHEEL_MAX_VELOCITY).toBeGreaterThan(MAX_VELOCITY);

    const 굴림 = nudge(INITIAL, wheelDelta(0, 9999), 1 / 60);
    expect(Math.abs(굴림.velocity)).toBe(WHEEL_MAX_VELOCITY);
  });
});

describe("위로 가기", () => {
  const 화면 = 900;
  const 문서 = 5000;

  it("맨 위에서는 안 보인다", () => {
    expect(shouldShowBackToTop(0, 화면, 문서)).toBe(false);
  });

  it("중간에서도 안 보인다", () => {
    expect(shouldShowBackToTop(2000, 화면, 문서)).toBe(false);
  });

  /** 딱 끝일 때만 내면 관성 때문에 깜빡인다. 한 화면의 4분의 1쯤 남으면 낸다. */
  it("바닥 가까이에서 보인다", () => {
    expect(shouldShowBackToTop(문서 - 화면 - 100, 화면, 문서)).toBe(true);
    expect(shouldShowBackToTop(문서 - 화면, 화면, 문서)).toBe(true);
  });

  it("스크롤할 데가 없으면 안 보인다", () => {
    expect(shouldShowBackToTop(0, 화면, 화면)).toBe(false);
    expect(shouldShowBackToTop(0, 0, 문서)).toBe(false);
  });
});

/**
 * 휠 한 칸이 얼마나 내려가는가.
 *
 * **맡기는 쪽이 기본이다.** 스크롤을 가로채면 트랙패드·확대·접근성 도구가
 * 쉽게 망가진다. 그래서 「손대는 경우」가 아니라 「손대지 않는 경우」를
 * 하나하나 잠근다 — 새 조건을 넣다가 그중 하나를 풀면 화면에서만 드러난다.
 */
describe("휠 한 칸의 거리", () => {
  const 화면 = 1000;
  /** 크롬이 마우스 한 칸에 보내는 값. 손으로 굴리므로 간격이 넓다. */
  const 마우스휠 = {
    deltaY: WHEEL_NOTCH, deltaMode: 0, ctrlKey: false, defaultPrevented: false,
    sinceLast: 200, viewport: 화면,
  };
  const 한칸 = 화면 * WHEEL_SCREEN_RATIO;

  it("브라우저 기본보다는 더 내려간다", () => {
    // 브라우저 기본은 delta 그대로(100px)다. 얼마나 더 갈지는 아래 「살짝」이 잰다.
    expect(boostedWheel(마우스휠)).toBeGreaterThan(WHEEL_NOTCH);
  });

  /**
   * **처음에 틀렸던 자리 ①.** `deltaY × 배수` 로 냈더니 마우스마다 갈렸다.
   * 윈도의 「한 번에 스크롤할 줄 수」를 1 로 둔 마우스는 33 쯤을 보내는데, 그
   * 사람은 79px 밖에 안 내려갔고 게다가 옛 하한(40)에 걸려 아예 손도 못 댔다.
   */
  it("작게 보내는 마우스도 한 칸은 한 칸이다", () => {
    for (const deltaY of [12, 33, 50, 100, 140]) {
      expect(boostedWheel({ ...마우스휠, deltaY }), `deltaY ${deltaY}`).toBe(한칸);
    }
  });

  it("두 칸을 한 번에 보내는 마우스는 두 칸으로 센다", () => {
    // 바닥에 묶어 두면 큰 값을 보내는 마우스만 느려진다.
    expect(boostedWheel({ ...마우스휠, deltaY: 200 })).toBe(한칸 * 2);
    expect(boostedWheel({ ...마우스휠, deltaY: 400 })).toBe(한칸 * 4);
  });

  /**
   * **처음에 틀렸던 자리 ②.** 고정 260px 로 바꿨더니 화면 크기에 따라 갈렸다.
   * 노트북에서는 화면의 3분의 1인데 큰 모니터에서는 5분의 1이었다.
   */
  it("어느 화면에서든 같은 비율이 지나간다", () => {
    for (const viewport of [700, 1000, 1440, 2160]) {
      const step = boostedWheel({ ...마우스휠, viewport });
      expect(step / viewport, `화면 ${viewport}`).toBeCloseTo(WHEEL_SCREEN_RATIO, 5);
    }
  });

  /**
   * **세 칸에 한 화면**이 기준이다. 브라우저 기본(한 칸 100px)으로는 이 화면에서
   * 「거의 안 움직인다」로 느껴진다 — 운영자가 네 번 「더」라고 했다. 그렇다고
   * 한 칸에 화면 반을 넘기면 읽던 자리를 잃는다.
   */
  it("세 칸에 한 화면이 지나간다", () => {
    expect(화면 / 한칸).toBeCloseTo(3, 0);
    expect(한칸).toBeGreaterThan(WHEEL_NOTCH * 3); // 기본의 세 배 이상
    expect(한칸 / 화면).toBeLessThan(0.5); // 그래도 한 칸에 반 화면은 넘지 않는다
  });

  it("화면 높이를 모르면 손대지 않는다", () => {
    // 엉뚱한 거리를 내는 것보다 브라우저에 맡기는 편이 낫다.
    expect(boostedWheel({ ...마우스휠, viewport: 0 })).toBe(0);
    expect(boostedWheel({ ...마우스휠, viewport: Number.NaN })).toBe(0);
  });

  it("위로 굴리면 위로 간다 — 부호를 뒤집지 않는다", () => {
    expect(boostedWheel({ ...마우스휠, deltaY: -WHEEL_NOTCH })).toBe(-한칸);
    expect(boostedWheel({ ...마우스휠, deltaY: -33 })).toBe(-한칸);
    expect(boostedWheel({ ...마우스휠, deltaY: -200 })).toBe(-한칸 * 2);
  });

  it("첫 화면 캐러셀이 가로챈 휠은 안 건드린다", () => {
    // 거기서 휠은 페이지를 내리는 것이 아니라 그림을 돌리는 것이다.
    expect(boostedWheel({ ...마우스휠, defaultPrevented: true })).toBe(0);
  });

  it("확대·축소는 안 건드린다", () => {
    expect(boostedWheel({ ...마우스휠, ctrlKey: true })).toBe(0);
  });

  it("트랙패드의 잔 델타는 안 건드린다", () => {
    expect(boostedWheel({ ...마우스휠, deltaY: MOUSE_WHEEL_MIN - 1 })).toBe(0);
    expect(boostedWheel({ ...마우스휠, deltaY: -(MOUSE_WHEEL_MIN - 1) })).toBe(0);
    // 경계에서는 건드린다 — 「이보다 작으면」이 조건이다.
    expect(boostedWheel({ ...마우스휠, deltaY: MOUSE_WHEEL_MIN })).not.toBe(0);
  });

  it("작은 값이 촘촘히 오면 안 건드린다 — 트랙패드는 60Hz 로 흘려보낸다", () => {
    const 잔값 = { ...마우스휠, deltaY: WHEEL_STREAM_MAX_DELTA - 1 };
    expect(boostedWheel({ ...잔값, sinceLast: WHEEL_STREAM_MS - 1 })).toBe(0);
    // 간격이 벌어지면 마우스로 본다.
    expect(boostedWheel({ ...잔값, sinceLast: WHEEL_STREAM_MS })).not.toBe(0);
  });

  /**
   * **여기가 「아직도 조금씩」의 범인일 수 있다.**
   *
   * 처음에는 「촘촘하면 무조건 흐르는 입력」으로 뒀다. 그런데 부드러운 스크롤을
   * 지원하는 마우스·드라이버는 한 칸을 여러 이벤트로 쪼개 빠르게 보낸다. 그러면
   * 첫 이벤트만 우리 손을 타고 나머지는 브라우저 기본으로 빠져 조금씩 내려간다.
   */
  it("큰 값이 촘촘히 오면 한 칸을 쪼개 보내는 마우스로 본다", () => {
    const 쪼개보내는마우스 = {
      ...마우스휠, deltaY: WHEEL_STREAM_MAX_DELTA, sinceLast: 5,
    };
    expect(boostedWheel(쪼개보내는마우스)).toBe(한칸);
    // 크롬 기본값(100)도 촘촘히 와도 받는다 — 빠르게 굴리는 손이다.
    expect(boostedWheel({ ...마우스휠, sinceLast: 5 })).toBe(한칸);
  });

  it("첫 휠은 흐르는 입력으로 오해하지 않는다", () => {
    expect(boostedWheel({ ...마우스휠, sinceLast: Number.POSITIVE_INFINITY })).not.toBe(0);
  });

  it("줄·장 단위로 오는 휠은 브라우저에 맡긴다", () => {
    expect(boostedWheel({ ...마우스휠, deltaMode: 1 })).toBe(0);
    expect(boostedWheel({ ...마우스휠, deltaMode: 2 })).toBe(0);
  });
});

describe("굴린 만큼 쌓인다", () => {
  const 끝 = 10000;
  const 한칸 = 240;

  it("이어서 굴리면 더해진다", () => {
    // 두 칸이면 두 칸만큼 간다. 앞의 남은 거리를 버리지 않는다.
    const 첫칸 = nextWheelTarget({ current: 1000, target: null, sinceLast: 9999, distance: 한칸, max: 끝 });
    expect(첫칸).toBe(1240);

    // 화면은 아직 1080 까지밖에 안 갔는데 다음 칸이 온다.
    const 둘째칸 = nextWheelTarget({ current: 1080, target: 첫칸, sinceLast: 120, distance: 한칸, max: 끝 });
    expect(둘째칸).toBe(1480);

    const 셋째칸 = nextWheelTarget({ current: 1150, target: 둘째칸, sinceLast: 120, distance: 한칸, max: 끝 });
    expect(셋째칸).toBe(1720);

    // 세 칸이면 세 칸이다. 옛 방식은 여기서 1390 이었다.
    expect(셋째칸 - 1000).toBe(한칸 * 3);
  });

  it("쉬었다 굴리면 지금 화면에서 다시 센다", () => {
    // 안 그러면 옛 목표가 남아 첫 칸에 화면이 튄다.
    const 쉰뒤 = nextWheelTarget({
      current: 1080, target: 5000, sinceLast: WHEEL_GESTURE_MS + 1, distance: 한칸, max: 끝,
    });
    expect(쉰뒤).toBe(1080 + 한칸);
  });

  it("이어지는 경계까지는 이어받는다", () => {
    const 경계 = nextWheelTarget({
      current: 1080, target: 1240, sinceLast: WHEEL_GESTURE_MS, distance: 한칸, max: 끝,
    });
    expect(경계).toBe(1480);
  });

  it("문서 밖으로 나가지 않는다", () => {
    // 끝에서 계속 굴려도 목표가 달아나면, 위로 굴릴 때 한참 아무 일도 안 난다.
    expect(nextWheelTarget({ current: 9900, target: 끝, sinceLast: 50, distance: 한칸, max: 끝 })).toBe(끝);
    expect(nextWheelTarget({ current: 100, target: 100, sinceLast: 50, distance: -한칸, max: 끝 })).toBe(0);
  });

  it("문서가 화면보다 짧으면 0 이다", () => {
    // `scrollHeight - innerHeight` 가 음수로 오는 경우다.
    expect(nextWheelTarget({ current: 0, target: null, sinceLast: 999, distance: 한칸, max: -50 })).toBe(0);
  });
});
