import { describe, expect, it } from "vitest";
import {
  REVIEW_CRITERIA,
  buildReviewPrompt,
  buildRevisionDirective,
  needsRevision,
  normalizeReview,
  reviewPenalty,
  summarizeReview,
  type BlueprintReview,
} from "./pdp.review";
import { SALES_PRINCIPLES } from "./pdp.sales-principles";
import type { LandingPageBlueprint } from "./types";

const blueprint: LandingPageBlueprint = {
  executiveSummary: "전통 방식의 진정성으로 설득한다",
  scorecard: [],
  blueprintList: [],
  sections: [
    {
      section_id: "S1",
      section_name: "문제 제기",
      goal: "공감",
      headline: "오늘 저녁 반찬, 아쉽지 않으셨나요",
      headline_en: "x",
      subheadline: "향이 날아간 기름은 티가 납니다",
      subheadline_en: "x",
      bullets: ["개봉 후 두 달"],
      bullets_en: ["x"],
      trust_or_objection_line: "",
      trust_or_objection_line_en: "",
      CTA: "",
      CTA_en: "",
      layout_notes: "중앙 카피",
      compliance_notes: "",
      image_id: "IMG_S1",
      purpose: "",
      prompt_ko: "",
      prompt_en: "scene",
      negative_prompt: "",
      style_guide: "",
      reference_usage: "",
    },
  ],
};

function 심사(overrides: Partial<Record<string, string>> = {}): BlueprintReview {
  return normalizeReview({
    verdict: "pass",
    items: REVIEW_CRITERIA.map((criterion) => ({
      criterion: criterion.id,
      rating: overrides[criterion.id] ?? "pass",
      evidence: `${criterion.label} 근거`,
      fix: "",
    })),
  });
}

describe("심사 항목", () => {
  it("일곱 가지를 본다", () => {
    // grounding 은 사진 경로 실측(2026-07-31) 뒤에 더했다. 확인되지 않은
    // 효능·성분·인증을 사실처럼 쓰는 것이 가장 크게 남은 결함이었다.
    expect(REVIEW_CRITERIA.map((c) => c.id)).toEqual([
      "audience",
      "problem",
      "differentiator",
      "objection",
      "flow",
      "grounding",
      "action",
    ]);
  });

  it("항목마다 한국어 이름과 판단 기준이 있다", () => {
    for (const criterion of REVIEW_CRITERIA) {
      expect(criterion.label.length).toBeGreaterThan(0);
      expect(criterion.question.length).toBeGreaterThan(10);
    }
  });
});

describe("심사 프롬프트", () => {
  const prompt = buildReviewPrompt(blueprint, "판매 원칙 본문");

  it("판매 원칙을 통째로 싣는다", () => {
    expect(prompt).toContain("판매 원칙 본문");
  });

  it("심사할 구성안을 싣는다", () => {
    expect(prompt).toContain("오늘 저녁 반찬, 아쉽지 않으셨나요");
    expect(prompt).toContain("문제 제기");
  });

  it("여섯 항목을 모두 지시한다", () => {
    for (const criterion of REVIEW_CRITERIA) {
      expect(prompt).toContain(criterion.label);
    }
  });

  // 심사자가 구성안을 쓴 맥락을 물려받으면 자기 글을 칭찬하게 된다.
  // 브리프 원문을 넣지 않는 것이 핵심이다.
  it("브리프 원문을 넣지 않는다", () => {
    expect(prompt).not.toContain("sourceText");
  });
});

describe("재생성 판단", () => {
  it("fail 이 하나라도 있으면 다시 만든다", () => {
    expect(needsRevision(심사({ objection: "fail" }))).toBe(true);
  });

  // weak 로 재생성하면 되돌이표가 된다. 완벽한 구성안은 없다.
  it("weak 만 있으면 다시 만들지 않는다", () => {
    expect(needsRevision(심사({ objection: "weak", flow: "weak" }))).toBe(false);
  });

  it("전부 통과면 다시 만들지 않는다", () => {
    expect(needsRevision(심사())).toBe(false);
  });
});

describe("재생성 지시문", () => {
  const directive = buildRevisionDirective(
    normalizeReview({
      verdict: "fail",
      items: [
        { criterion: "audience", rating: "pass", evidence: "구체적", fix: "" },
        { criterion: "objection", rating: "fail", evidence: "가격 언급 없음", fix: "가격 반론을 다뤄라" },
        { criterion: "flow", rating: "weak", evidence: "3번이 겉돈다", fix: "3번을 4번 뒤로" },
      ],
    }),
  );

  it("미달 항목의 수정 지시를 담는다", () => {
    expect(directive).toContain("가격 반론을 다뤄라");
  });

  // weak 은 재생성 사유는 아니지만, 다시 만드는 김에 같이 고치는 게 낫다.
  it("weak 항목도 함께 담는다", () => {
    expect(directive).toContain("3번을 4번 뒤로");
  });

  it("통과 항목은 담지 않는다", () => {
    expect(directive).not.toContain("구체적");
  });
});

describe("응답 정규화", () => {
  it("모르는 항목은 버린다", () => {
    const review = normalizeReview({
      verdict: "pass",
      items: [
        { criterion: "audience", rating: "pass", evidence: "a", fix: "" },
        { criterion: "존재하지_않는_항목", rating: "fail", evidence: "b", fix: "c" },
      ],
    });
    expect(review.items.map((i) => i.criterion)).toEqual(["audience"]);
  });

  // 모델이 이상한 등급을 주면 통과로 넘기면 안 된다. 미달 쪽이 안전하다.
  it("모르는 등급은 weak 로 떨어진다", () => {
    const review = normalizeReview({
      verdict: "pass",
      items: [{ criterion: "flow", rating: "훌륭함", evidence: "a", fix: "" }],
    });
    expect(review.items[0].rating).toBe("weak");
  });

  it("응답이 통째로 망가져도 죽지 않는다", () => {
    for (const broken of [null, undefined, {}, { items: "배열이 아님" }, []]) {
      const review = normalizeReview(broken);
      expect(review.items).toEqual([]);
      expect(needsRevision(review)).toBe(false);
    }
  });

  // verdict 는 모델의 자기 판단이다. 항목별 등급과 어긋나면 등급을 믿는다.
  it("verdict 가 pass 여도 fail 항목이 있으면 다시 만든다", () => {
    const review = normalizeReview({
      verdict: "pass",
      items: [{ criterion: "problem", rating: "fail", evidence: "a", fix: "b" }],
    });
    expect(needsRevision(review)).toBe(true);
  });
});

describe("사용자에게 보여줄 요약", () => {
  it("남은 지적을 숨기지 않는다", () => {
    const summary = summarizeReview(심사({ objection: "fail", flow: "weak" }));
    expect(summary.failed).toBe(1);
    expect(summary.weak).toBe(1);
    expect(summary.passed).toBe(5);
  });

  it("전부 통과면 지적이 없다", () => {
    const summary = summarizeReview(심사());
    expect(summary.failed).toBe(0);
    expect(summary.weak).toBe(0);
  });
});

/**
 * 재작성이 늘 개선은 아니다. 어느 쪽을 쓸지 정하려면 비교가 필요하다.
 *
 * fail 하나는 weak 여럿보다 나쁘다 — fail 은 "이대로 만들면 안 된다"는 뜻이다.
 */
describe("심사 비교", () => {
  const make = (ratings: Array<"pass" | "weak" | "fail">) => ({
    items: ratings.map((rating, index) => ({
      criterion: `c${index}`,
      rating,
      evidence: "",
      fix: "",
    })),
  });

  it("전부 통과가 가장 좋다", () => {
    expect(reviewPenalty(make(["pass", "pass"]))).toBe(0);
  });

  it("fail 하나가 weak 여럿보다 나쁘다", () => {
    expect(reviewPenalty(make(["fail"]))).toBeGreaterThan(reviewPenalty(make(["weak", "weak", "weak"])));
  });

  it("fail 이 같으면 weak 으로 가린다", () => {
    expect(reviewPenalty(make(["fail", "weak"]))).toBeGreaterThan(reviewPenalty(make(["fail"])));
  });

  it("심사를 못 받았으면 가장 나쁘게 본다", () => {
    // 판단할 근거가 없는 것을, 결함을 아는 것보다 낫다고 볼 수 없다.
    expect(reviewPenalty(null)).toBe(Number.POSITIVE_INFINITY);
    expect(reviewPenalty(null)).toBeGreaterThan(reviewPenalty(make(["fail", "fail"])));
  });
});

describe("근거 심사 항목", () => {
  it("확인되지 않은 효능·성분·인증을 fail 로 본다", () => {
    // 사진 경로 실측에서 가장 크게 남은 결함이다. 정규식은 이런 부드러운 주장을 못 잡는다.
    const grounding = REVIEW_CRITERIA.find((criterion) => criterion.id === "grounding");
    expect(grounding).toBeDefined();
    expect(grounding!.question).toContain("효능");
    expect(grounding!.question).toContain("인증");
    expect(grounding!.question).toContain("fail");
  });
});

/**
 * 판매 원칙과 시스템이 서로 다른 말을 하면 안 된다.
 *
 * 원칙을 사진 경로에 켜면서 드러난 모순이다. 원칙은 "오늘 주문하면 모레 아침
 * 받아보십니다"를 좋은 예로 들었는데, **AI 는 배송 조건을 알 수 없다.**
 * 실측에서 그대로 나왔다 — "오늘 오후 2시 전 주문 시 출발".
 * 지어낸 배송 약속은 신뢰 문제가 아니라 표시광고법 문제다.
 */
describe("마무리 항목이 지어낸 조건을 잡는다", () => {
  const action = REVIEW_CRITERIA.find((criterion) => criterion.id === "action")!;

  it("지어낸 배송·마감 조건을 fail 로 본다", () => {
    expect(action.question).toContain("배송");
    expect(action.question).toContain("fail");
  });

  it("버튼 문구를 요구하지 않는다", () => {
    // 이 페이지는 이미지라 링크를 걸 수 없다. CTA 는 빈 문자열로 둔다.
    expect(action.question).toContain("버튼 문구를 요구하지 마라");
  });
});

describe("판매 원칙이 시스템과 어긋나지 않는다", () => {
  it("배송 조건을 지어내지 말라고 말한다", () => {
    expect(SALES_PRINCIPLES).toContain("배송·재고·마감 조건을 지어내지 않는다");
  });

  it("버튼 문구를 만들지 말라고 말한다", () => {
    expect(SALES_PRINCIPLES).toContain("버튼 문구는 만들지 않는다");
  });

  it("배송 약속을 좋은 예로 들지 않는다", () => {
    // 예전에는 "나은 예" 였다. 그 문장이 그대로 결과에 나왔다.
    const better = SALES_PRINCIPLES.slice(SALES_PRINCIPLES.indexOf("나은 예: 손이"));
    expect(better).not.toContain("모레 아침 받아보십니다");
  });
});

