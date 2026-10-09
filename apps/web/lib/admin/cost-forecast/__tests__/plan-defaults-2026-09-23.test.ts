import { describe, expect, it } from "vitest";
import { PLAN_ASSUMPTIONS, PLAN_DEFAULTS, pricePlans } from "../subscription-plans";

/**
 * **2026-09-23 사용자 확정 기본값과 카드뉴스 5장 기준.**
 *
 * ── 카드뉴스가 왜 8에서 5로 가나 ───────────────────────────
 *
 * 「지금 카드뉴스가 기본 8장으로 계산하는데 5장 기준으로 변경하세요」.
 *
 * 비용 전략의 다른 자리는 **이미 5장으로 세고 있었다** — 작업 표가
 * 「6카드 중 생성 이미지 5장 가정」이라고 적어 뒀다. 플랜 표만 8이라
 * 같은 화면 안에서 두 숫자가 갈려 있었다. 이번에 맞춘다.
 *
 * ── 왜 값으로 재 두나 ──────────────────────────────────────
 *
 * 기본값은 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 숫자만 다르다.
 * 그래서 확정값을 여기에 박아 둔다.
 */

describe("카드뉴스는 5장 기준이다", () => {
  it("**세는 기준이 5다**", () => {
    expect(PLAN_ASSUMPTIONS.usage.cardnews).toBe(5);
  });

  it("**상세페이지 9장·인쇄용 2크레딧은 그대로다**", () => {
    expect(PLAN_ASSUMPTIONS.usage.pdp).toBe(9);
    expect(PLAN_ASSUMPTIONS.usage.print).toBe(2);
  });
});

/**
 * **2026-10-09 사용자: 정가 그대로 받는다.** 구독 플랜 표(월 구독 플랜 계획_261008)가 우선이다.
 * 09-23 에는 정가에서 약 30% 를 더 깎아 62,033·109,074·209,898원을 받는 기본값이었다 —
 * 그러면 상세페이지 마진이 최소선 30% 아래로 내려가 할인을 뺐다.
 */
describe("2026-10-09 확정 기본값 — 정가 그대로", () => {
  const byId = (id: string) => pricePlans(PLAN_DEFAULTS).find(p => p.id === id)!;

  it("**크레딧·목표 마진이 확정값이고 추가 할인은 없다**", () => {
    expect(PLAN_DEFAULTS.map(p => [p.id, p.credits, p.targetPct, p.discountPct])).toEqual([
      ["basic", 75, 53, 0],
      ["premium", 150, 48.5, 0],
      ["ultra", 300, 45.8, 0],
    ]);
  });

  /** 구독 플랜 표의 정가 그대로 나와야 한다. */
  it("**월 가격이 89,000·159,000·299,000원이다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.listPrice)).toEqual([89_000, 159_000, 299_000]);
  });

  it("**고객 결제액이 정가와 같다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.paidPrice)).toEqual([89_000, 159_000, 299_000]);
  });

  it("**1개당 1,187·1,060·997원이다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => Math.round(p.unitPrice))).toEqual([1_187, 1_060, 997]);
  });

  it("**실제 마진이 53.0·48.5·45.8% 다**", () => {
    expect(byId("basic").marginPct).toBeCloseTo(53.0, 1);
    expect(byId("premium").marginPct).toBeCloseTo(48.5, 1);
    expect(byId("ultra").marginPct).toBeCloseTo(45.8, 1);
  });

  it("**크레딧 더 받음이 기준·+12%·+19% 다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.bonusPct)).toEqual([0, 12, 19]);
  });
});

/**
 * **카드뉴스 기준이 바뀌면 만들 수 있는 세트 수가 바뀐다.**
 *
 * 8장일 때 Basic 은 9세트였다. 5장이면 15세트다.
 */
describe("한 달에 만들 수 있는 양", () => {
  it("**세 플랜의 카드뉴스가 15·30·60세트다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.usage.cardnews)).toEqual([15, 30, 60]);
  });

  it("**나머지 칸은 안 건드렸다**", () => {
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.usage.pdp)).toEqual([8, 16, 33]);
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.usage.images)).toEqual([75, 150, 300]);
    expect(pricePlans(PLAN_DEFAULTS).map(p => p.usage.print)).toEqual([37, 75, 150]);
  });
});
