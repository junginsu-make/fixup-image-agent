import { describe, expect, it, vi } from "vitest";
import {
  MIN_STYLE_SIMILARITY,
  analyzeStyleImage,
  buildStyleAnalysisPrompt,
  buildStyleQuery,
  describeStyleForPrompt,
  normalizeStyleAnalysis,
  pickStyleReference,
  type StyleReferenceMatch,
} from "./pdp.style-reference";
import type { ProductBrief } from "./types";

const brief: ProductBrief = {
  offeringName: "예천 들기름",
  offeringKind: "other",
  oneLiner: "저온에서 눌러 짠 들기름",
  audience: "성분을 따지는 30대",
  problem: "향이 날아간다",
  outcome: "반찬의 격이 올라간다",
  differentiators: ["저온압착", "주문 후 압착"],
  objections: ["비싸다"],
  pricePositioning: "프리미엄",
  tone: "진정성",
  assumptions: [],
  sourceText: "경북 예천 3대째 들기름",
};

function match(similarity: number, name = "네이비 옐로"): StyleReferenceMatch {
  return {
    id: `id-${name}`,
    name,
    description: "짙은 네이비 배경에 머스터드 옐로 강조. 굵은 압축 산세리프.",
    imageBase64: "AAAA",
    mimeType: "image/jpeg",
    similarity,
  };
}

describe("검색 질의", () => {
  const query = buildStyleQuery(brief, "차분함");

  it("무엇을 파는지와 인상을 함께 담는다", () => {
    expect(query).toContain("예천 들기름");
    expect(query).toContain("프리미엄");
    expect(query).toContain("차분함");
  });

  // 검색 대상은 디자인 특성 서술이다. 원문을 통째로 넣으면 상품 사실관계가
  // 질의를 지배해서 디자인이 아니라 품목이 비슷한 것을 끌어온다.
  it("사용자 원문을 통째로 넣지 않는다", () => {
    expect(query).not.toContain("경북 예천 3대째 들기름");
  });

  it("톤을 안 주면 브리프의 톤을 쓴다", () => {
    expect(buildStyleQuery(brief)).toContain("진정성");
  });
});

describe("레퍼런스 고르기", () => {
  it("가장 비슷한 것을 고른다", () => {
    const picked = pickStyleReference([match(0.42, "가"), match(0.55, "나"), match(0.31, "다")]);
    expect(picked?.name).toBe("나");
  });

  // 강도가 "디자인 전체"라, 어울리지 않는 레퍼런스를 씌우면 없느니만 못하다.
  it("하한 미달뿐이면 아무것도 고르지 않는다", () => {
    expect(pickStyleReference([match(0.1), match(0.2)])).toBeNull();
  });

  it("후보가 없으면 아무것도 고르지 않는다", () => {
    expect(pickStyleReference([])).toBeNull();
  });

  it("하한은 무관한 것을 거를 만큼은 높다", () => {
    expect(MIN_STYLE_SIMILARITY).toBeGreaterThan(0.25);
    expect(MIN_STYLE_SIMILARITY).toBeLessThan(0.6);
  });
});

describe("이미지 분석 프롬프트", () => {
  const prompt = buildStyleAnalysisPrompt();

  it("디자인 특성 다섯 가지를 요구한다", () => {
    for (const key of ["팔레트", "서체", "구성", "분위기", "상품군"]) {
      expect(prompt).toContain(key);
    }
  });

  // 검색 대상이 이 서술이다. 무엇이 찍혔는지가 아니라 어떤 디자인인지를 적어야
  // "차분한 프리미엄 식품" 같은 질의에 걸린다.
  it("피사체가 아니라 디자인을 적으라고 지시한다", () => {
    expect(prompt).toMatch(/피사체|무엇이 찍|사물/);
  });
});

describe("분석 결과 정규화", () => {
  it("다섯 항목을 한 덩이 서술로 합친다", () => {
    const text = normalizeStyleAnalysis({
      palette: "짙은 네이비와 머스터드 옐로",
      typography: "굵은 압축 산세리프",
      composition: "대형 헤드라인 중앙, 아래 굵은 가로선",
      mood: "대담하고 그래픽적",
      suitedFor: "식품, 주류, 굿즈",
    });

    expect(text).toContain("짙은 네이비");
    expect(text).toContain("굵은 압축 산세리프");
    expect(text).toContain("식품");
  });

  it("빈 항목은 건너뛴다", () => {
    const text = normalizeStyleAnalysis({ palette: "네이비", typography: "", mood: "차분함" });
    expect(text).toContain("네이비");
    expect(text).toContain("차분함");
    expect(text.split("\n").length).toBe(2);
  });

  it("응답이 망가져도 빈 문자열을 준다", () => {
    for (const broken of [null, undefined, "문자열", 42, []]) {
      expect(normalizeStyleAnalysis(broken)).toBe("");
    }
  });
});

describe("생성 프롬프트에 싣는 지시", () => {
  const directive = describeStyleForPrompt(match(0.5));

  // 사용자가 "디자인 전체"를 골랐다. 색만 참고하라고 하면 그 선택을 배신한다.
  it("디자인 전체를 따르라고 지시한다", () => {
    expect(directive).toMatch(/palette|colour|color/i);
    expect(directive).toMatch(/typograph|letter/i);
  });

  it("레퍼런스의 서술을 함께 싣는다", () => {
    expect(directive).toContain("네이비");
  });

  it("레퍼런스가 없으면 빈 문자열", () => {
    expect(describeStyleForPrompt(null)).toBe("");
  });
});

describe("조각으로 들어오면 그것부터 말해 준다", () => {
  it("한 장이면 조각 이야기를 안 한다", () => {
    expect(buildStyleAnalysisPrompt(1)).not.toContain("자른 조각");
    expect(buildStyleAnalysisPrompt()).not.toContain("자른 조각");
  });

  /** 안 밝히면 서로 다른 그림 넷으로 읽고 「여러 디자인이 섞였다」고 적는다. */
  it("여러 장이면 한 페이지를 나눈 것이라고 밝힌다", () => {
    const prompt = buildStyleAnalysisPrompt(4);
    expect(prompt).toContain("4장");
    expect(prompt).toContain("자른 조각");
    expect(prompt).toContain("한 페이지");
  });
});

// 이 서술은 자동 추천에만 쓰인다. 생성에는 원본 이미지가 그대로 첨부되므로
// 서술이 없어도 손해가 없다. 그런데 기다림에 한도가 없어서 화면이 몇 분씩
// "분석하는 중"에 갇힌 적이 있다 — 곁다리가 본 작업을 막으면 안 된다.
const 그림 = [{ base64: "AAAA", mimeType: "image/png" }];

describe("분석은 본 작업을 막지 않는다", () => {
  it("응답이 오지 않으면 기다리다 빈 서술로 끝난다", async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<unknown>(() => {});
      const pending = analyzeStyleImage(그림, undefined, () => never);
      await vi.advanceTimersByTimeAsync(20_000);
      await expect(pending).resolves.toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("분석이 던져도 빈 서술로 끝난다", async () => {
    await expect(
      analyzeStyleImage(그림, undefined, async () => {
        throw new Error("quota exceeded");
      }),
    ).resolves.toBe("");
  });

  it("이미지가 없으면 부르지도 않는다", async () => {
    let 불렸나 = false;
    const description = await analyzeStyleImage([], undefined, async () => {
      불렸나 = true;
      return { palette: "네이비" };
    });
    expect(description).toBe("");
    expect(불렸나).toBe(false);
  });

  /**
   * 긴 상세페이지는 조각으로 나뉘어 들어온다. 한 장만 보내면 위쪽만 보고
   * 서술을 적고, 그 서술이 자동 추천의 유일한 근거가 된다.
   */
  it("받은 조각을 전부 넘긴다", async () => {
    const 조각들 = [
      { base64: "S1", mimeType: "image/jpeg" },
      { base64: "S2", mimeType: "image/jpeg" },
      { base64: "S3", mimeType: "image/jpeg" },
    ];
    let 받은것: unknown;

    await analyzeStyleImage(조각들, undefined, async (images) => {
      받은것 = images;
      return { palette: "네이비" };
    });

    expect(받은것).toEqual(조각들);
  });

  it("제때 오면 그 서술을 쓴다", async () => {
    const description = await analyzeStyleImage(그림, undefined, async () => ({
      palette: "네이비와 옐로",
    }));
    expect(description).toContain("네이비와 옐로");
  });
});
