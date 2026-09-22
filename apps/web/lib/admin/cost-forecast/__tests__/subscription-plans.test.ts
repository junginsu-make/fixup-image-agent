import { describe, expect, it } from "vitest";
import { PLAN_DEFAULTS, pricePlans, validatePlanInputs } from "../subscription-plans";

const byId = (id: string) => pricePlans(PLAN_DEFAULTS).find(p => p.id === id)!;

describe("월 구독 플랜 계산", () => {
  it("기본값은 2026-09-22 확정 가격을 그대로 낸다 — 90,000·144,000·240,000원", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => [p.credits, p.listPrice, p.paidPrice])).toEqual([
      [75, 90_000, 90_000], [150, 144_000, 144_000], [300, 240_000, 240_000],
    ]);
  });

  it("1개당 가격과 세 가지 마진을 계산한다", () => {
    const basic = byId("basic");
    expect(basic.unitPrice).toBe(1_200);
    expect(basic.marginPct).toBeCloseTo(53.4, 1);
    expect(basic.wadizMarginPct).toBeCloseTo(38.4, 1);
    expect(basic.allInMarginPct).toBeCloseTo(28.4, 1);
    expect(byId("ultra").allInMarginPct).toBeCloseTo(9.7, 1);
  });

  it("고객 혜택은 첫 플랜(베이직) 단가와 비교한다 — +25%·+50%", () => {
    expect([byId("basic").bonusPct, byId("premium").bonusPct, byId("ultra").bonusPct]).toEqual([0, 25, 50]);
    expect([byId("premium").unitDiscountPct, byId("ultra").unitDiscountPct]).toEqual([20, 33]);
  });

  it("목표 마진을 바꾸면 크레딧은 그대로, 가격은 1,000원 단위 반올림으로 다시 정한다", () => {
    const [basic] = pricePlans([{ ...PLAN_DEFAULTS[0], targetPct: 50 }]);
    expect(basic.credits).toBe(75);
    expect(basic.listPrice).toBe(83_000); // 정확히는 82,500원
    expect(basic.unitPrice).toBeCloseTo(1_106.67, 2);
  });

  it("추가 할인은 월 가격에서 빼고, 1개당 가격과 마진이 함께 내려간다", () => {
    const [basic] = pricePlans([{ ...PLAN_DEFAULTS[0], discountPct: 10 }]);
    expect(basic.listPrice).toBe(90_000);
    expect(basic.paidPrice).toBe(81_000);
    expect(basic.unitPrice).toBe(1_080);
    expect(basic.marginPct).toBeCloseTo(49.2, 1); // 81,000 − 부가세 7,364 − 원가 33,750
  });

  it("만들 수 있는 양은 크레딧에서 나온다 — 상세페이지 9장·카드뉴스 8장·인쇄용 2크레딧", () => {
    expect(byId("premium").usage).toEqual({ pdp: 16, cardnews: 18, images: 150, print: 75 });
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
