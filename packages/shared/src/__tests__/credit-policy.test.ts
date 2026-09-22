import { describe, expect, it } from "vitest";
import { imageCredits, quoteCredits, purchaseExpiresAt, subscriptionExpiresAt, WORK_CREDIT_PRESETS } from "../credit-policy";

describe("서비스와 비용 전략실의 공통 차감 정책", () => {
  it("크레딧의 옛 뜻과 새 뜻을 명시적으로 구분한다", () => {
    const input = { legacyUnits: 5, outputs: [{ width: 1024, height: 1024 }] };
    expect(quoteCredits("cost-v1", input).units).toBe(5);
    expect(quoteCredits("image-v2", input).units).toBe(1);
  });
  it("최종 이미지 장수와 큰 크기 예외를 함께 센다", () => {
    expect(imageCredits({ width: 1536, height: 2752 })).toBe(1);
    expect(imageCredits({ width: 2400, height: 3392 })).toBe(2);
    expect(imageCredits({ width: 2000, height: 3000 })).toBe(2);
    expect(quoteCredits("image-v2", { legacyUnits: 50, outputs: [{ width: 1024, height: 1024 }, { width: 2400, height: 3392 }] }).units).toBe(3);
    expect(quoteCredits("image-v2", { legacyUnits: 1, outputs: [] }).units).toBe(0);
  });
  it("크기를 숨기거나 잘못된 값을 넣어 저렴한 등급으로 통과하지 않는다", () => {
    expect(() => imageCredits({ width: 0, height: 100 })).toThrow();
    expect(() => imageCredits({ width: NaN, height: 100 })).toThrow();
    expect(() => imageCredits({ width: 100.5, height: 100 })).toThrow();
  });
  it("구매분은 KST 달력 3개월, 구독은 다음 KST 월초에 끝난다", () => {
    expect(purchaseExpiresAt("2026-01-30T15:30:00Z")).toBe("2026-04-29T15:30:00.000Z");
    expect(subscriptionExpiresAt("2026-09-30T15:01:00Z")).toBe("2026-10-31T15:00:00.000Z");
  });
  it("작업 환산은 상세페이지 전체와 개별 이미지를 구분한다", () => {
    expect(WORK_CREDIT_PRESETS.find(x => x.id === "pdp")?.images).toBe(9);
    expect(WORK_CREDIT_PRESETS.find(x => x.id === "poster")?.images).toBe(1);
  });
});
