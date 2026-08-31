import { describe, expect, it } from "vitest";
import { defaultPreserveProduct, shouldSendAnchor } from "./pdp.product-anchor";

describe("앵커를 보낼지 판단", () => {
  // 레퍼런스가 없으면 앵커가 유일한 시각 기준이다. 빼면 섹션마다 상품이 달라진다.
  it("스타일 레퍼런스가 없으면 항상 보낸다", () => {
    expect(shouldSendAnchor({ hasStyleReference: false, preserveProduct: true })).toBe(true);
    expect(shouldSendAnchor({ hasStyleReference: false, preserveProduct: false })).toBe(true);
  });

  it("레퍼런스가 있고 제품 보존을 켜면 보낸다", () => {
    expect(shouldSendAnchor({ hasStyleReference: true, preserveProduct: true })).toBe(true);
  });

  // 참조가 둘이면 모델이 절충한다. 실측에서 배경·글자는 레퍼런스를 따랐는데
  // 제품 라벨만 앵커 성향으로 남았다. 디자인을 온전히 받으려면 앵커를 뺀다.
  it("레퍼런스가 있고 제품 보존을 끄면 보내지 않는다", () => {
    expect(shouldSendAnchor({ hasStyleReference: true, preserveProduct: false })).toBe(false);
  });
});

describe("제품 보존 기본값", () => {
  // 사진으로 시작하면 실물 상품이 있다. 그 생김새가 매번 달라지면 안 된다.
  it("사진으로 시작하면 켠다", () => {
    expect(defaultPreserveProduct({ startedFromImage: true })).toBe(true);
    expect(defaultPreserveProduct({ startedFromImage: true, offeringKind: "course" })).toBe(true);
  });

  // 무형 상품은 지킬 실물이 없다. 디자인을 온전히 받는 편이 낫다.
  it("무형 상품이면 끈다", () => {
    for (const kind of ["course", "coaching", "subscription", "software", "community"] as const) {
      expect(defaultPreserveProduct({ startedFromImage: false, offeringKind: kind })).toBe(false);
    }
  });

  it("유형 상품이면 켠다", () => {
    expect(defaultPreserveProduct({ startedFromImage: false, offeringKind: "other" })).toBe(true);
  });

  // 판단 근거가 없으면 켜 둔다. 지금 동작을 유지하는 쪽이 안전하다 —
  // 껐다가 상품이 매번 달라지면 사용자는 원인을 알 수 없다.
  it("알 수 없으면 켠다", () => {
    expect(defaultPreserveProduct({ startedFromImage: false })).toBe(true);
    expect(defaultPreserveProduct({})).toBe(true);
  });
});
