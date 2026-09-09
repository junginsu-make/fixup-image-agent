import { describe, expect, it } from "vitest";
import { isSliced, planReferenceSlices } from "../reference-slices";

/**
 * 자르는 자리를 잘못 잡으면 **아래쪽이 조용히 사라진다.**
 * 나눗셈 나머지 몇 줄에 푸터와 CTA 가 들어 있다.
 */

const total = (regions: { height: number }[]) => regions.reduce((sum, r) => sum + r.height, 0);

describe("짧은 그림은 안 자른다", () => {
  it("정사각은 한 조각", () => {
    expect(planReferenceSlices(1000, 1000)).toEqual([{ top: 0, height: 1000 }]);
  });

  it("2.2배까지는 한 조각", () => {
    expect(planReferenceSlices(1000, 2200)).toHaveLength(1);
  });

  it("2.2배를 넘으면 자른다", () => {
    expect(planReferenceSlices(1000, 2201).length).toBeGreaterThan(1);
  });
});

describe("긴 상세페이지를 나눈다", () => {
  it("길수록 많이 나누되 넷을 안 넘는다", () => {
    expect(planReferenceSlices(1000, 3600)).toHaveLength(2);
    expect(planReferenceSlices(1000, 5400)).toHaveLength(3);
    expect(planReferenceSlices(1000, 7200)).toHaveLength(4);
    expect(planReferenceSlices(1080, 15000)).toHaveLength(4);
    expect(planReferenceSlices(1080, 100000)).toHaveLength(4);
  });

  it("조각이 위에서 아래로 이어진다", () => {
    const regions = planReferenceSlices(1000, 5400);
    expect(regions[0]!.top).toBe(0);
    for (let i = 1; i < regions.length; i += 1) {
      expect(regions[i]!.top).toBe(regions[i - 1]!.top + regions[i - 1]!.height);
    }
  });

  /** 나머지를 버리면 맨 아래 몇 줄이 사라진다. */
  it("높이를 한 픽셀도 안 잃는다", () => {
    expect(total(planReferenceSlices(1000, 5401))).toBe(5401);
    expect(total(planReferenceSlices(1080, 15000))).toBe(15000);
    expect(total(planReferenceSlices(777, 9999))).toBe(9999);
  });

  it("마지막 조각이 남은 것을 다 가져간다", () => {
    const regions = planReferenceSlices(1000, 5401);
    const last = regions[regions.length - 1]!;
    expect(last.top + last.height).toBe(5401);
  });
});

describe("이상한 값", () => {
  it("크기를 모르면 통째로 본다", () => {
    expect(planReferenceSlices(0, 0)).toEqual([{ top: 0, height: 0 }]);
    expect(planReferenceSlices(-1, 500)).toEqual([{ top: 0, height: 500 }]);
  });
});

describe("나뉘었는지 알려준다", () => {
  it("한 조각이면 아니다", () => {
    expect(isSliced(planReferenceSlices(1000, 1000))).toBe(false);
  });

  it("여럿이면 그렇다", () => {
    expect(isSliced(planReferenceSlices(1080, 15000))).toBe(true);
  });
});
