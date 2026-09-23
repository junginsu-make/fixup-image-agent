import { describe, expect, it } from "vitest";
import { planRowsToSave } from "../cost-plan-save";
import { PLAN_DEFAULTS, pricePlans } from "../cost-forecast/subscription-plans";

/**
 * **비용 전략에서 정한 값이 실제 구독 플랜이 된다**(2026-09-23 사용자 요청).
 *
 * 「여기서 등급 크레딧을 바꾸거나 비용이 바꾸면 (…) 회원 관리 페이지에서도
 * 등급을 부여하고 크레딧을 부여하는데 거기도 여기에 저장한 값을 자동 적용
 * 시켜야합니다」
 */

describe("무엇을 저장하는가", () => {
  it("**크레딧이 한 달 지급 수가 된다**", () => {
    expect(planRowsToSave(PLAN_DEFAULTS).map(r => r.monthly_units)).toEqual([75, 150, 300]);
  });

  /**
   * **월 가격이 아니라 고객 결제액이다**(2026-09-23 사용자 결정).
   *
   * 회원 관리에 뜨는 금액이 실제 청구액과 다르면, 결제 확인을 할 때 어느
   * 쪽이 맞는지 다시 따져야 한다.
   */
  it("**고객 결제액이 플랜 가격이 된다** — 월 가격이 아니다", () => {
    const rows = planRowsToSave(PLAN_DEFAULTS);
    const priced = pricePlans(PLAN_DEFAULTS);

    expect(rows.map(r => r.price_krw)).toEqual([62_033, 109_074, 209_898]);
    expect(rows.map(r => r.price_krw)).toEqual(priced.map(p => p.paidPrice));
    expect(rows.map(r => r.price_krw), "월 가격을 저장하고 있다").not.toEqual(priced.map(p => p.listPrice));
  });

  it("**이름과 아이디가 그대로 간다**", () => {
    expect(planRowsToSave(PLAN_DEFAULTS).map(r => [r.id, r.name])).toEqual([
      ["basic", "Basic"], ["premium", "Premium"], ["ultra", "Ultra"],
    ]);
  });

  /**
   * **저장한 플랜은 쓸 수 있는 플랜이다.** 꺼 두면 회원 관리 고르개에 안 뜨고
   * 그러면 저장한 의미가 없다.
   */
  it("**저장하면 켜진 상태다**", () => {
    expect(planRowsToSave(PLAN_DEFAULTS).every(r => r.active)).toBe(true);
  });

  it("**가격은 정수다** — 표의 제약이 정수다", () => {
    for (const row of planRowsToSave(PLAN_DEFAULTS)) {
      expect(Number.isInteger(row.price_krw), `${row.id} 가 정수가 아니다`).toBe(true);
    }
  });
});

/**
 * **화면에 보이는 값과 저장되는 값이 같아야 한다.**
 *
 * 두 벌로 계산하면 언젠가 갈린다. 그래서 `pricePlans` 하나만 쓴다.
 */
describe("화면과 저장이 같은 계산을 쓴다", () => {
  it("**크레딧을 바꾸면 저장값도 따라 바뀐다**", () => {
    const rows = planRowsToSave([{ ...PLAN_DEFAULTS[0]!, credits: 100 }]);
    const [priced] = pricePlans([{ ...PLAN_DEFAULTS[0]!, credits: 100 }]);

    expect(rows[0]!.monthly_units).toBe(100);
    expect(rows[0]!.price_krw).toBe(priced!.paidPrice);
  });

  it("**할인을 바꾸면 저장 가격이 따라 바뀐다**", () => {
    const 할인없음 = planRowsToSave([{ ...PLAN_DEFAULTS[0]!, discountPct: 0 }]);
    const 할인많음 = planRowsToSave([{ ...PLAN_DEFAULTS[0]!, discountPct: 50 }]);

    expect(할인많음[0]!.price_krw).toBeLessThan(할인없음[0]!.price_krw);
  });
});

/**
 * **말이 안 되는 값은 저장에 닿기 전에 막는다.**
 *
 * `planRowsToSave` 는 `pricePlans` 를 거치고, 그것이 `validatePlanInputs` 로
 * 거른다. 여기서 막히면 데이터베이스까지 안 간다.
 */
describe("말이 안 되는 값", () => {
  it("**크레딧 0개는 막는다**", () => {
    expect(() => planRowsToSave([{ ...PLAN_DEFAULTS[0]!, credits: 0 }])).toThrow();
  });

  it("**소수 크레딧은 막는다**", () => {
    expect(() => planRowsToSave([{ ...PLAN_DEFAULTS[0]!, credits: 10.5 }])).toThrow();
  });

  it("**빈 목록은 막는다**", () => {
    expect(() => planRowsToSave([])).toThrow();
  });
});
