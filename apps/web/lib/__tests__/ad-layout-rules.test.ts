import { describe, expect, it } from "vitest";
import { objectPlacement, OBJECT_MARGIN, OBJECT_HEIGHT_RATIO, MIN_WIDTH_RATIO, isTooSmall } from "../ad/layout-rules";

/**
 * 오브젝트를 어디에 얼마나 크게 놓는가.
 *
 * 설계: `docs/superpowers/plans/2026-09-07-ad-assembly-engine.md` §5.4 · §5.5
 *
 * **초판 규칙은 높이만 정해서 두 방향으로 터졌다.**
 * - 세로로 긴 피사체에서 폭 5~13% — 「빈 배너에 점 하나」
 * - 4.24:1 을 넘으면 `left` 가 음수 — `composite` 가 조용히 자른다
 *
 * **무작위가 아니라 격자로 쓴다.** `derive.ts` 머리말이 「무작위 표본은 경계를
 * 못 잡는다」고 적은 그 방법이다.
 */

const CANVASES = [
  { name: "비즈보드", width: 1029, height: 258 },
  { name: "스마트채널", width: 750, height: 160 },
  { name: "정사각", width: 1200, height: 1200 },
];

/** 배경 제거가 내놓을 수 있는 모양을 넓게 쓴다 — 실측 인물이 0.469 다. */
const RATIOS = [0.1, 0.25, 0.469, 0.56, 0.8, 1, 1.5, 1.91, 3, 4.5, 6, 10];

function grid(run: (canvas: typeof CANVASES[number], object: { width: number; height: number }) => void) {
  for (const canvas of CANVASES) {
    for (const ratio of RATIOS) {
      // 크기를 셋으로 바꿔 가며 — 배율 계산이 크기에 안 휘둘려야 한다.
      // **작은 것을 꼭 넣는다.** 확대가 걸리는 자리에서 반올림이 1픽셀
      // 넘친다 — 큰 것만 쓰면 그 경계를 안 밟는다.
      for (const base of [16, 21, 27, 51, 100, 899, 4000]) {
        run(canvas, { width: Math.max(1, Math.round(base * ratio)), height: base });
      }
    }
  }
}

describe("배치 불변식 — 격자로 쓴다", () => {
  it("캔버스 안에서 시작한다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      expect(p.left, `${canvas.name} ${object.width}x${object.height}`).toBeGreaterThanOrEqual(0);
      expect(p.top).toBeGreaterThanOrEqual(0);
    });
  });

  /** **검사가 아니라 여기서 보증한다**(설계 §5.5 불변식 2). */
  it("캔버스 밖으로 안 나간다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      const where = `${canvas.name} ${object.width}x${object.height}`;
      expect(p.left + p.width, where).toBeLessThanOrEqual(canvas.width);
      expect(p.top + p.height, where).toBeLessThanOrEqual(canvas.height);
    });
  });

  it("비율을 안 바꾼다 — 늘이거나 찌그러뜨리지 않는다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      /**
       * **격자가 만든 `ratio` 가 아니라 오브젝트의 실제 비율과 견준다.**
       * `round(16 * 0.1) = 2` 라 실제 비율은 0.1 이 아니라 0.125 다 — 기대값을
       * 잘못 잡으면 **구현이 맞는데 시험이 틀린다.**
       */
      const want = object.width / object.height;
      expect(Math.abs(p.width / p.height - want) / want,
        `${canvas.name} ${object.width}x${object.height}`).toBeLessThan(0.05);
    });
  });

  it("정해진 높이를 안 넘는다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      expect(p.height).toBeLessThanOrEqual(Math.round(canvas.height * OBJECT_HEIGHT_RATIO));
    });
  });

  /** `composite` 가 소수를 못 받는다. */
  it("정수만 돌려준다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      for (const value of [p.left, p.top, p.width, p.height]) {
        expect(Number.isInteger(value)).toBe(true);
      }
    });
  });

  /** 여백은 불변식이다 — 자리가 없으면 오브젝트를 줄인다(설계 §5.4 ①). */
  it("오른쪽 여백을 지킨다", () => {
    grid((canvas, object) => {
      const p = objectPlacement(canvas, object);
      expect(canvas.width - (p.left + p.width)).toBeGreaterThanOrEqual(OBJECT_MARGIN);
    });
  });

  /**
   * **여백이 실제로 크기를 줄인다.** 위 시험은 「여백 이상 남는다」만 보므로
   * `OBJECT_MARGIN = 0` 으로 바꿔도 통과한다 — 그러면 오브젝트가 캔버스
   * 가장자리에 붙고 「오른쪽 물체 + 왼쪽 여백」이 아니게 된다.
   */
  it("여백만큼 좁은 상자에 맞춘다", () => {
    const canvas = { width: 1029, height: 258 };
    // 가로로 아주 긴 것 — 폭이 상자에 걸려 여백이 크기를 정한다
    const p = objectPlacement(canvas, { width: 4500, height: 1000 });
    expect(p.width).toBe(canvas.width - OBJECT_MARGIN * 2);
    expect(p.left).toBe(OBJECT_MARGIN);
    expect(OBJECT_MARGIN, "여백이 0 이면 이 규칙이 뜻을 잃는다").toBeGreaterThan(0);
  });
});

describe("반올림이 경계를 넘지 않는다", () => {
  /**
   * **내림이어야 한다.** 배율을 곱한 뒤 반올림하거나 올리면 **1픽셀 넘칠 수
   * 있다** — `composite` 는 넘친 만큼 조용히 자른다. 위 격자가 못 잡는 이유는
   * 딱 맞아떨어지는 조합을 안 밟기 때문이라, 경계를 직접 만든다.
   *
   * 상자 폭에 정확히 맞는 오브젝트에 **0.5픽셀만 더 넓은** 것을 준다.
   */
  it("상자에 딱 걸치는 크기에서 안 넘친다", () => {
    for (const canvas of [
      { width: 1029, height: 258 },
      { width: 750, height: 160 },
      { width: 1200, height: 1200 },
    ]) {
      const boxWidth = canvas.width - OBJECT_MARGIN * 2;
      const boxHeight = Math.round(canvas.height * OBJECT_HEIGHT_RATIO);
      // 폭이 상자보다 아주 조금 넓은 것 — 배율이 1 바로 아래로 떨어진다
      for (const bump of [1, 2, 3, 7]) {
        const p = objectPlacement(canvas, { width: boxWidth * 2 + bump, height: boxHeight * 2 });
        const where = `${canvas.width}x${canvas.height} +${bump}`;
        expect(p.left + p.width, where).toBeLessThanOrEqual(canvas.width - OBJECT_MARGIN);
        expect(p.top + p.height, where).toBeLessThanOrEqual(canvas.height);
        expect(p.width, where).toBeLessThanOrEqual(boxWidth);
        expect(p.height, where).toBeLessThanOrEqual(boxHeight);
      }
    }
  });
});

describe("작은 오브젝트를 키울 때 안 넘친다", () => {
  /**
   * **여기가 반올림이 터지는 자리다.** 오브젝트가 상자보다 작으면 배율이
   * 1 을 넘어 확대가 걸리는데, 그때 반올림하면 **상자를 1픽셀 넘는다** —
   * 21×21 을 비즈보드에 놓으면 `floor` 는 237×237(상자에 딱), `ceil` 은
   * 238×238 이다. `composite` 는 넘친 만큼 조용히 자른다.
   */
  it("확대해도 상자를 안 넘는다", () => {
    const canvas = { width: 1029, height: 258 };
    const boxWidth = canvas.width - OBJECT_MARGIN * 2;
    const boxHeight = Math.round(canvas.height * OBJECT_HEIGHT_RATIO);
    for (const object of [
      { width: 16, height: 27 }, { width: 21, height: 21 }, { width: 27, height: 27 },
      { width: 30, height: 51 }, { width: 32, height: 54 }, { width: 35, height: 21 },
    ]) {
      const p = objectPlacement(canvas, object);
      const where = `${object.width}x${object.height}`;
      expect(p.width, where).toBeLessThanOrEqual(boxWidth);
      expect(p.height, where).toBeLessThanOrEqual(boxHeight);
      expect(p.top + p.height, where).toBeLessThanOrEqual(canvas.height);
    }
  });
});

describe("초판 규칙이 터지던 자리", () => {
  const bizboard = { width: 1029, height: 258 };

  it("가로로 아주 긴 오브젝트도 캔버스 안에 든다", () => {
    // 초판: 4.5:1 에서 left = -62
    const p = objectPlacement(bizboard, { width: 4500, height: 1000 });
    expect(p.left).toBeGreaterThanOrEqual(OBJECT_MARGIN);
    expect(p.left + p.width).toBeLessThanOrEqual(bizboard.width - OBJECT_MARGIN);
  });

  it("세로로 긴 오브젝트는 높이에 맞춘다", () => {
    const p = objectPlacement(bizboard, { width: 422, height: 899 });
    expect(p.height).toBe(Math.round(258 * OBJECT_HEIGHT_RATIO));
  });
});

describe("너무 작아진 것을 알린다", () => {
  /**
   * **막지 않고 알린다**(설계 §5.4 ②). 세로로 긴 피사체를 늘리면 찌그러지고
   * 자르면 얼굴이 잘린다 — 둘 다 광고로 못 쓴다. 사람이 다른 마스터를 고르게 한다.
   */
  it("실측 인물(0.469)은 비즈보드에서 걸린다", () => {
    const p = objectPlacement({ width: 1029, height: 258 }, { width: 422, height: 899 });
    expect(p.width / 1029).toBeLessThan(MIN_WIDTH_RATIO);
    expect(isTooSmall({ width: 1029, height: 258 }, p)).toBe(true);
  });

  it("정사각은 안 걸린다", () => {
    const canvas = { width: 1029, height: 258 };
    const p = objectPlacement(canvas, { width: 800, height: 800 });
    expect(isTooSmall(canvas, p)).toBe(false);
  });

  it("가로로 넓은 것도 안 걸린다", () => {
    const canvas = { width: 1029, height: 258 };
    expect(isTooSmall(canvas, objectPlacement(canvas, { width: 1910, height: 1000 }))).toBe(false);
  });
});
