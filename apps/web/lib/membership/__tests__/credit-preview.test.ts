import { describe, it, expect } from "vitest";
import { imageCredits, quoteCredits } from "@fixup/shared";
import { posterCreditSize, pdpCreditSize, snsCreditSize, knownPosterCreditSize } from "../image-sizes";
import { usageFromRow } from "../usage-row";
import { easyCost } from "../../../app/easy/cost";
import { planCostUnits } from "../../../app/poster/plan-cost";

describe("회원 안내와 서버 차감 정책", () => {
  it("표준형 Easy 1회는 API 원가와 관계없이 기획 0 + 이미지 1", () => {
    const input = { modelId: "gpt-image-2.5-flare", ratioId: "1:1", attachmentCount: 3 };
    const size = posterCreditSize(input.modelId, input.ratioId);
    expect(easyCost({ ...input, policy: "image-v2" }).units).toBe(quoteCredits("image-v2", { legacyUnits: 5, outputs: [size] }).units);
    expect(planCostUnits({ attachmentCount: 3, policy: "image-v2" })).toBe(0);
    expect(easyCost(input).units).toBeGreaterThan(1);
  });
  it("인쇄 크기는 2, 상세페이지와 카드의 현재 기본 크기는 1", () => {
    expect(imageCredits(posterCreditSize("gpt-image-2", "match-source", { width: 3840, height: 2160 }))).toBe(2);
    expect(imageCredits(pdpCreditSize("gpt-image-2.5-flare", "9:16"))).toBe(1);
    expect(imageCredits(snsCreditSize("1:1"))).toBe(1);
    expect(knownPosterCreditSize("gpt-image-2", "match-source")).toBeUndefined();
  });
  it("이미 차감된 장부 잔액에서 이번 달 사용량을 다시 빼지 않는다", () => {
    const wallet = usageFromRow({ pricing_policy: "image-v2", balance: 80, available: 70, reserved: 10, used: 200 });
    expect(wallet.remaining).toBe(70);expect(wallet.quota).toBe(280);expect(wallet.reserved).toBe(10);
    expect(usageFromRow({ quota: 100, used_units: 20, reserved_units: 10 }).remaining).toBe(70);
  });
});
