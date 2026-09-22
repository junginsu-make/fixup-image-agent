import { describe, expect, it } from "vitest";
import { createScenario } from "../schema";
import { compareLaunchPlans, createLaunchStrategy, recommendedLaunchStrategy, validateLaunchStrategy } from "../launch-strategy";

describe("와디즈 상품 전략", () => {
  it("15% 보너스와 15% 수수료는 다른 계산이다", () => {
    const result = compareLaunchPlans(createLaunchStrategy(), createScenario(true));
    const [basic, premium, purchase] = result.results;
    expect(basic!.issuedCredits).toBe(115); expect(premium!.issuedCredits).toBe(230); expect(purchase!.issuedCredits).toBe(115);
    expect(basic!.images).toBe(115); expect(basic!.channelFeeKrw).toBe(15000);
    expect(basic!.operatingBudgetKrw).toBeCloseTo(45909.0909);
    expect(basic!.marginPct).toBeCloseTo(basic!.profitKrw! / basic!.priceKrw * 100);
    expect(basic!.creditUnitPriceKrw).toBeCloseTo(premium!.creditUnitPriceKrw);
  });
  it("옛 순매출 기준 비교안은 보존하고 새 추천은 구매금액 기준이다", () => {
    const old: Record<string, unknown> = { ...createLaunchStrategy() }; delete old.marginBasis;
    expect(validateLaunchStrategy(old).marginBasis).toBe("net-sales");
    const result = compareLaunchPlans(recommendedLaunchStrategy(), createScenario(true));
    expect(result.config.marginBasis).toBe("payment");
    expect(result.results.map(p => p.issuedCredits)).toEqual([20, 50, 110, 23]);
    expect(result.results[0]!.creditUnitPriceKrw).toBeGreaterThan(result.results[1]!.creditUnitPriceKrw);
    expect(result.results[1]!.creditUnitPriceKrw).toBeGreaterThan(result.results[2]!.creditUnitPriceKrw);
    expect(result.results[3]!.creditUnitPriceKrw).toBeGreaterThan(result.results[0]!.creditUnitPriceKrw);
  });
  it("보너스 전량을 소진하면 API 비용도 함께 늘어난다", () => {
    const config = createLaunchStrategy(), scenario = createScenario(true);
    const base = compareLaunchPlans(config, scenario).results[0]!;
    config.plans[0]!.bonusPct = 30;
    const more = compareLaunchPlans(config, scenario).results[0]!;
    expect(more.apiKrw).toBeGreaterThan(base.apiKrw); expect(more.marginPct).toBeLessThan(base.marginPct!);
  });
  it("광고비와 무료 모집 크레딧은 각각 이익에서 빠진다", () => {
    const config = createLaunchStrategy(), scenario = createScenario(true);
    const base = compareLaunchPlans(config, scenario);
    config.adBudgetKrw = 500000; config.eventRecipients = 100; config.eventCredits = 10;
    const event = compareLaunchPlans(config, scenario);
    expect(event.eventImages).toBe(1000);
    expect(event.results[0]!.eventPerSaleKrw).toBeGreaterThan(5000);
    expect(event.results[0]!.marginPct).toBeLessThan(base.results[0]!.marginPct!);
  });
  it("공식 조건은 수수료VAT와 프로젝트 기본료를 포함하되 PG를 중복하지 않는다", () => {
    const config = createLaunchStrategy(); config.feeMode = "official-cash";
    const result = compareLaunchPlans(config, createScenario(true));
    expect(result.effectiveFeePct).toBe(16.5); expect(result.projectFeeKrw).toBe(108900);
    expect(result.results[0]!.channelFeeKrw).toBe(16500);
  });
  it("미입력 인프라에서는 30% 마진 달성을 확정하지 않는다", () => {
    const result = compareLaunchPlans(createLaunchStrategy(), createScenario(false));
    expect(result.results[0]!.marginPct).toBeNull(); expect(result.results[0]!.meetsTarget).toBeNull();
  });
  it("구매형은 이월 기간 운영비를 적립하고, 기계적으로 구독과 같다고 하지 않는다", () => {
    const result = compareLaunchPlans(createLaunchStrategy(), createScenario(true));
    expect(result.results[2]!.infraReserveKrw).toBeGreaterThan(result.results[0]!.infraReserveKrw!);
  });
  it("크레딧당 원가가 0인 작업에서도 역산은 제한된 반복으로 끝난다", () => {
    const s = createScenario(true); s.profiles[0]!.unitOverrideUsd = 0;
    const result = compareLaunchPlans(createLaunchStrategy(), s);
    expect(result.results[0]!.maxCreditsCapped).toBe(true);
  });
});
