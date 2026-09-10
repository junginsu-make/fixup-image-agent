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
  beginDrag,
  clampVelocity,
  dragBy,
  endDrag,
  nudge,
  scrollDeltaFromPixels,
  step,
} from "../drag-physics";
import { IDLE_AMPLITUDE, MAX_BEND, relaxBend, targetBend, worldXOf } from "../wave";
import { scrollBehaviorFor } from "../scroll-down";
import {
  FRESH_BUDGET,
  TURN_PIXELS,
  WHEEL_TURNS,
  addRoll,
  resetIfAtTop,
  shouldCaptureWheel,
  shouldShowBackToTop,
  turnsSpent,
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
   * **영원히 돌지는 않는다.** 마우스만 쓰는 사람이 첫 화면에 갇히면 아래에
   * 무엇이 있는지 영영 모른다.
   */
  it("다섯 바퀴까지만 캐러셀이 받는다", () => {
    let budget = FRESH_BUDGET;
    for (let turn = 0; turn < WHEEL_TURNS; turn += 1) {
      expect(shouldCaptureWheel(0, 히어로높이, budget)).toBe(true);
      budget = addRoll(budget, TURN_PIXELS);
    }

    // 여섯 바퀴째는 페이지가 받는다.
    expect(turnsSpent(budget)).toBe(WHEEL_TURNS);
    expect(shouldCaptureWheel(0, 히어로높이, budget)).toBe(false);
  });

  /** 트랙패드는 잘게 여러 번 보낸다. 이벤트 수가 아니라 거리로 세야 한다. */
  it("잘게 굴려도 거리로 센다", () => {
    let budget = FRESH_BUDGET;
    for (let i = 0; i < 14; i += 1) budget = addRoll(budget, 10);
    expect(turnsSpent(budget)).toBe(1);
  });

  it("어느 방향으로 돌려도 한 바퀴는 한 바퀴다", () => {
    expect(turnsSpent(addRoll(FRESH_BUDGET, -TURN_PIXELS))).toBe(1);
  });

  it("첫 화면으로 돌아오면 다시 다섯 바퀴를 준다", () => {
    const 다쓴것 = addRoll(FRESH_BUDGET, TURN_PIXELS * WHEEL_TURNS);
    expect(resetIfAtTop(다쓴것, 0)).toEqual(FRESH_BUDGET);
    // 아직 아래에 있으면 그대로 둔다.
    expect(resetIfAtTop(다쓴것, 400)).toBe(다쓴것);
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
