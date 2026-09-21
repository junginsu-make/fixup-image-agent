import { describe, expect, it } from "vitest";
import { defaultPreserveProduct } from "./pdp.product-anchor";

/*
  **앵커를 보낼지**는 이제 `anchorKind` 가 정한다 — 실물 사진은 언제나 보내고,
  우리가 만든 대표 이미지는 디자인 레퍼런스가 있으면 보내지 않는다(U-03).

  그 판단과 「얼마나 지킬 것인가」(`anchorRoleFor`)는
  `pdp.product-anchor-role.test.ts` 가 잰다. 여기 있던 세 시험은 전부
  `preserveProduct` 로 갈렸는데, 이제 그 값은 보낼지 말지를 안 정한다.
*/

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
