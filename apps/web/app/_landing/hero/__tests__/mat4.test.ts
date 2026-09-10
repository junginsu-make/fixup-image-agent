import { describe, expect, it } from "vitest";
import { chain, identity, multiply, rotationY, scaling, translation } from "../mat4";
import type { Mat4 } from "../mat4";

/**
 * 행렬 순서를 틀리면 **화면에서 조용히 사라진다.**
 *
 * 처음 판 배치가 그랬다 — 가운데 한 장만 보이고 옆 판이 안 보였다. 오류도
 * 경고도 없었다. 이동을 먼저 하고 회전·확대를 나중에 하는 바람에 이동값까지
 * 함께 돌아가서 판이 화면 밖으로 날아간 것이었다.
 *
 * 그래서 「점 하나를 넣으면 어디로 가는가」를 값으로 잰다.
 */

/** 열 우선 행렬에 점 하나를 통과시킨다. */
function apply(m: Mat4, x: number, y: number, z: number) {
  return {
    x: m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    y: m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    z: m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  };
}

describe("기본", () => {
  it("단위행렬은 아무것도 안 바꾼다", () => {
    const p = apply(identity(), 2, 3, 4);
    expect([p.x, p.y, p.z]).toEqual([2, 3, 4]);
  });

  it("이동은 더한다", () => {
    const p = apply(translation(1, -2, 5), 0, 0, 0);
    expect([p.x, p.y, p.z]).toEqual([1, -2, 5]);
  });

  it("확대는 곱한다", () => {
    const p = apply(scaling(2, 3, 1), 1, 1, 1);
    expect([p.x, p.y, p.z]).toEqual([2, 3, 1]);
  });

  it("Y축 90도 회전은 x를 -z로 보낸다", () => {
    const p = apply(rotationY(Math.PI / 2), 1, 0, 0);
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(-1);
  });
});

describe("순서", () => {
  /**
   * `multiply(a, b)` 는 **b 를 먼저** 적용한다. 열 우선 규약이다.
   * 이걸 반대로 알면 아래 「판 배치」가 통째로 어긋난다.
   */
  it("곱하기는 오른쪽부터 적용한다", () => {
    const scaleThenMove = multiply(translation(10, 0, 0), scaling(2, 2, 2));
    const p = apply(scaleThenMove, 1, 0, 0);
    // 2배 키운 뒤 10 만큼 옮긴다 → 12. 반대로 하면 22 가 된다.
    expect(p.x).toBeCloseTo(12);
  });

  /**
   * 판 하나를 놓는 실제 순서다. **키우고 → 돌리고 → 옮긴다.**
   * 옮기기를 먼저 하면 이동값까지 돌아가 판이 엉뚱한 데로 간다.
   */
  it("키우고 돌리고 옮긴 판이 제자리에 선다", () => {
    const model = chain(translation(2, 0, -1), rotationY(Math.PI / 2), scaling(3, 3, 1));

    // 판의 중심은 이동값 그대로여야 한다.
    const center = apply(model, 0, 0, 0);
    expect(center.x).toBeCloseTo(2);
    expect(center.z).toBeCloseTo(-1);

    // 오른쪽 모서리는 90도 돌았으니 앞뒤(z)로 간다. 크기 3배가 반영된다.
    const edge = apply(model, 0.5, 0, 0);
    expect(edge.x).toBeCloseTo(2);
    expect(edge.z).toBeCloseTo(-2.5);
  });

  /** 순서를 뒤집으면 실제로 어긋난다는 것까지 못 박는다. */
  it("순서를 뒤집으면 중심이 제자리를 벗어난다", () => {
    const wrong = chain(scaling(3, 3, 1), rotationY(Math.PI / 2), translation(2, 0, -1));
    const center = apply(wrong, 0, 0, 0);
    expect(Math.abs(center.x - 2)).toBeGreaterThan(0.5);
  });
});
