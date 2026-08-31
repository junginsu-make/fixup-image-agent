import { describe, expect, it } from "vitest";
import {
  PRODUCT_GROUNDING_RULES,
  PRODUCT_READING_RULES,
  PRODUCT_READING_SCHEMA,
  isProductReadingUsable,
  normalizeProductReading,
  type ProductReading,
} from "./pdp.product-reading";
import { buildAnalyzePrompt } from "./pdp.service";

/**
 * 사진 경로는 사진 한 장에서 곧바로 카피로 건너뛰었다. 그래서 아무 제품에나
 * 붙는 일반론이 나왔고, 그걸 금지 문구 목록으로 하나씩 막아 왔다.
 *
 * 이제 **제품을 먼저 읽고** 그것만 근거로 쓰게 한다.
 */

function reading(overrides: Partial<ProductReading> = {}): ProductReading {
  return {
    category: "펌프형 유리병에 든 수분 세럼",
    visibleFacts: ["하늘색 반투명 유리", "원목 캡", "은색 펌프"],
    labelText: [],
    distinctiveTraits: ["원목 캡"],
    unknowns: ["효능", "가격", "성분 함량"],
    ...overrides,
  };
}

describe("제품 읽기 지시", () => {
  it("확인된 것과 모르는 것을 갈라 적게 한다", () => {
    // 이 구분이 핵심이다. 모르는 것을 적게 해야 그 자리를 사실로 단정하지 않는다.
    expect(PRODUCT_READING_RULES).toContain("visibleFacts");
    expect(PRODUCT_READING_RULES).toContain("unknowns");
    expect(PRODUCT_READING_RULES).toContain("사실로 단정하지 않는다");
  });

  it("라벨 글자를 지어내지 말라고 말한다", () => {
    expect(PRODUCT_READING_RULES).toContain("읽히지 않는 글자를 지어내지 않는다");
  });

  it("범주를 좁게 잡으라고 말한다", () => {
    // "화장품" 처럼 넓게 잡으면 뒤 문장도 뭉뚱그려진다.
    expect(PRODUCT_READING_RULES).toContain("범주를 좁게");
  });
});

describe("제품 밀착 규칙", () => {
  it("바꿔치기 시험을 시킨다", () => {
    // 다른 제품 페이지에 붙여도 말이 되면 그 문장은 이 제품을 설명하지 않는다.
    expect(PRODUCT_GROUNDING_RULES).toContain("바꿔치기 시험");
    expect(PRODUCT_GROUNDING_RULES).toContain("다른 제품 페이지에 그대로 붙여도");
  });

  it("카피가 읽어낸 사실에 붙어 있어야 한다고 말한다", () => {
    expect(PRODUCT_GROUNDING_RULES).toContain("visibleFacts");
    expect(PRODUCT_GROUNDING_RULES).toContain("붙어 있어야");
  });

  it("이 페이지가 제품을 강조하는 것임을 못 박는다", () => {
    expect(PRODUCT_GROUNDING_RULES).toContain("제품을 강조하고 설명하는");
  });
});

describe("응답 스키마", () => {
  it("다섯 항목을 모두 요구한다", () => {
    expect(Object.keys(PRODUCT_READING_SCHEMA.properties)).toEqual([
      "category",
      "visibleFacts",
      "labelText",
      "distinctiveTraits",
      "unknowns",
    ]);
  });
});

describe("사진 경로 프롬프트에 실린다", () => {
  it("제품 읽기와 밀착 규칙이 함께 간다", () => {
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt).toContain("먼저 제품을 읽는다");
    expect(prompt).toContain("카피는 제품에서 나와야 한다");
  });

  it("섹션 규칙보다 앞에 온다", () => {
    // 섹션을 다 구상한 뒤에 읽으라고 하면 형식만 채우게 된다.
    const prompt = buildAnalyzePrompt(undefined, undefined, null, "full-image");
    expect(prompt.indexOf("먼저 제품을 읽는다")).toBeLessThan(prompt.indexOf("# 섹션 템플릿"));
  });
});

describe("응답 정규화", () => {
  it("문자열이 아닌 항목과 빈 문자열을 버린다", () => {
    const result = normalizeProductReading({
      category: "  수분 세럼  ",
      visibleFacts: ["하늘색 유리", "", 42, null, "원목 캡"],
      labelText: null,
      distinctiveTraits: ["원목 캡"],
      unknowns: ["효능"],
    });
    expect(result?.category).toBe("수분 세럼");
    expect(result?.visibleFacts).toEqual(["하늘색 유리", "원목 캡"]);
    expect(result?.labelText).toEqual([]);
  });

  it("전부 비면 없는 것으로 본다", () => {
    // 빈 껍데기를 들고 다니면 화면이 헛돈다.
    expect(normalizeProductReading({ category: "", visibleFacts: [], labelText: [] })).toBeUndefined();
    expect(normalizeProductReading(undefined)).toBeUndefined();
    expect(normalizeProductReading("문자열")).toBeUndefined();
  });

  it("unknowns 만 있어도 살린다", () => {
    // 사진이 정말 단순하면 확인된 것이 적을 수 있다. 그래도 모르는 것은 남겨야
    // 카피가 그 자리를 지어내지 않는다.
    const result = normalizeProductReading({ category: "정체 불명 용기", unknowns: ["전부"] });
    expect(result?.unknowns).toEqual(["전부"]);
  });
});

describe("쓸 만한 읽기인가", () => {
  it("범주와 확인된 사실이 있으면 쓸 만하다", () => {
    expect(isProductReadingUsable(reading())).toBe(true);
  });

  it("범주가 한 낱말이면 아니다", () => {
    expect(isProductReadingUsable(reading({ category: "병" }))).toBe(false);
  });

  it("확인된 사실이 하나뿐이면 아니다", () => {
    expect(isProductReadingUsable(reading({ visibleFacts: ["파란색"] }))).toBe(false);
  });

  it("없으면 아니다", () => {
    expect(isProductReadingUsable(undefined)).toBe(false);
  });
});
