import { describe, expect, it } from "vitest";
import { PLAN_DEFAULTS, pricePlans, validatePlanInputs } from "../subscription-plans";

/**
 * **계산은 기본값과 따로 잰다**(2026-09-23).
 *
 * 전에는 `PLAN_DEFAULTS` 를 그대로 넣어 쟀다. 그래서 사용자가 확정값을 바꿀
 * 때마다 **계산 규칙은 그대로인데 시험이 무더기로 빨개졌다.** 규칙을 재는
 * 자리에는 규칙만 두고, 그날의 확정값은
 * `plan-defaults-2026-09-23.test.ts` 가 따로 잠근다.
 */
const 플랜 = (over: Partial<(typeof PLAN_DEFAULTS)[number]> = {}) =>
  ({ id: "basic", name: "Basic", credits: 75, targetPct: 53.4, discountPct: 0, ...over });

const one = (over: Partial<(typeof PLAN_DEFAULTS)[number]> = {}) => pricePlans([플랜(over)])[0]!;

describe("월 구독 플랜 계산", () => {
  it("목표 마진에서 월 가격이 나온다 — 1,000원 단위 반올림", () => {
    // 75개 × 450원 원가에 53.4% 를 얹으면 정확히는 89,978원이다.
    expect(one().listPrice).toBe(90_000);
    expect(one().paidPrice).toBe(90_000);
  });

  it("1개당 가격과 세 가지 마진을 계산한다", () => {
    const basic = one();
    expect(basic.unitPrice).toBe(1_200);
    expect(basic.marginPct).toBeCloseTo(53.4, 1);
    expect(basic.wadizMarginPct).toBeCloseTo(38.4, 1);
    expect(basic.allInMarginPct).toBeCloseTo(28.4, 1);
  });

  it("고객 혜택은 첫 플랜 단가와 비교한다", () => {
    const priced = pricePlans([
      플랜(),
      플랜({ id: "premium", name: "Premium", credits: 150, targetPct: 44 }),
      플랜({ id: "ultra", name: "Ultra", credits: 300, targetPct: 34.7 }),
    ]);

    expect(priced.map(p => p.bonusPct)).toEqual([0, 25, 50]);
    expect(priced.map(p => p.unitDiscountPct)).toEqual([0, 20, 33]);
  });

  it("목표 마진을 바꾸면 크레딧은 그대로, 가격은 1,000원 단위 반올림으로 다시 정한다", () => {
    const basic = one({ targetPct: 50 });
    expect(basic.credits).toBe(75);
    expect(basic.listPrice).toBe(83_000); // 정확히는 82,500원
    expect(basic.unitPrice).toBeCloseTo(1_106.67, 2);
  });

  it("추가 할인은 월 가격에서 빼고, 1개당 가격과 마진이 함께 내려간다", () => {
    const basic = one({ discountPct: 10 });
    expect(basic.listPrice).toBe(90_000);
    expect(basic.paidPrice).toBe(81_000);
    expect(basic.unitPrice).toBe(1_080);
    expect(basic.marginPct).toBeCloseTo(49.2, 1); // 81,000 − 부가세 7,364 − 원가 33,750
  });

  it("만들 수 있는 양은 크레딧에서 나온다 — 상세페이지 9장·카드뉴스 5장·인쇄용 2크레딧", () => {
    expect(one({ credits: 150 }).usage).toEqual({ pdp: 16, cardnews: 30, images: 150, print: 75 });
  });

  it("말이 안 되는 입력은 막는다", () => {
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0], targetPct: 95 }])).toThrow();
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0], discountPct: -1 }])).toThrow();
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0], credits: 0 }])).toThrow();
    expect(() => validatePlanInputs([])).toThrow();
  });

  it("기본값 배열을 바꾸지 않는다", () => {
    const before = structuredClone(PLAN_DEFAULTS);
    pricePlans([{ ...PLAN_DEFAULTS[0], discountPct: 30 }]);
    expect(PLAN_DEFAULTS).toEqual(before);
  });
});
