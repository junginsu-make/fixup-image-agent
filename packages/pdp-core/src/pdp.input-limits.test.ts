import { describe, expect, it } from "vitest";
import {
  PAGE_CONTEXT_MAX_LENGTH,
  SELLER_BRIEF_MAX_LENGTH,
  overLimitFields,
} from "./pdp.input-limits";
import { normalizeSellerBrief } from "./pdp.seller-brief";

/**
 * **입력을 몰래 자르지 않는다**(U-08).
 *
 * 판매자 칸은 화면에 제한이 없었다. 사용자는 얼마든지 적고, 그 뒤에 둘 중
 * 하나가 일어났다.
 *
 * - `normalizeSellerBrief` 가 **말없이 500자에서 잘랐다**
 * - 서버 검증이 걸리면 「요청이 올바르지 않습니다」 한 줄이 떴다 — 어느 칸이
 *   왜 걸렸는지 **아무 말도 없이**
 *
 * 「그 밖에」 칸은 더 이상했다. **기획은 길이 제한이 없고 이미지 생성만 500자**라,
 * 501자를 적으면 구성안은 나오고 **이미지를 만들 때** 400 이 난다.
 *
 * 설계 §6: 「입력 칸의 최대 길이는 **서버와 UI가 공유한다.** 현재 판매자 500자
 * 제한은 보이게 표시하고 초과 시 수정 요청한다. **입력을 몰래 자르지 않는다.**」
 */

const 긴글 = (n: number) => "가".repeat(n);

describe("제한은 한 곳에 있다", () => {
  it("판매자 칸과 배경 칸의 상한이 있다", () => {
    expect(SELLER_BRIEF_MAX_LENGTH).toBeGreaterThan(0);
    expect(PAGE_CONTEXT_MAX_LENGTH).toBeGreaterThan(0);
  });
});

describe("넘친 칸을 짚어 준다", () => {
  it("**어느 칸이 얼마나 넘쳤는지 말한다**", () => {
    const 넘침 = overLimitFields({
      audience: 긴글(SELLER_BRIEF_MAX_LENGTH + 20),
      problem: "짧다",
    });

    expect(넘침).toHaveLength(1);
    expect(넘침[0]!.key).toBe("audience");
    expect(넘침[0]!.length).toBe(SELLER_BRIEF_MAX_LENGTH + 20);
    expect(넘침[0]!.limit).toBe(SELLER_BRIEF_MAX_LENGTH);
    // 사용자가 읽을 이름이 붙는다. 「audience」로는 어느 칸인지 모른다.
    expect(넘침[0]!.label.length).toBeGreaterThan(1);
  });

  it("**딱 맞으면 안 넘친 것이다**", () => {
    expect(overLimitFields({ audience: 긴글(SELLER_BRIEF_MAX_LENGTH) })).toEqual([]);
  });

  it("여러 칸이 넘치면 다 말한다", () => {
    const 넘침 = overLimitFields({
      audience: 긴글(SELLER_BRIEF_MAX_LENGTH + 1),
      emphasis: 긴글(SELLER_BRIEF_MAX_LENGTH + 1),
    });

    expect(넘침.map((field) => field.key)).toEqual(["audience", "emphasis"]);
  });

  it("**배경 칸도 함께 본다** — 기획은 통과하고 이미지에서 막히던 칸이다", () => {
    const 넘침 = overLimitFields({}, 긴글(PAGE_CONTEXT_MAX_LENGTH + 1));

    expect(넘침[0]!.key).toBe("pageContext");
    expect(넘침[0]!.limit).toBe(PAGE_CONTEXT_MAX_LENGTH);
  });

  it("빈 값은 넘칠 수 없다", () => {
    expect(overLimitFields({}, "")).toEqual([]);
    expect(overLimitFields({})).toEqual([]);
  });
});

describe("몰래 자르지 않는다", () => {
  it("**긴 값을 그대로 둔다** — 자르면 사용자가 뭘 잃었는지 모른다", () => {
    const 긴것 = 긴글(SELLER_BRIEF_MAX_LENGTH + 100);

    expect(normalizeSellerBrief({ audience: 긴것 }).audience).toHaveLength(긴것.length);
  });

  it("앞뒤 공백은 여전히 걷어낸다", () => {
    expect(normalizeSellerBrief({ audience: "  직장인  " }).audience).toBe("직장인");
  });

  it("공백만 있으면 없는 것으로 본다", () => {
    expect(normalizeSellerBrief({ audience: "   " }).audience).toBeUndefined();
  });
});
