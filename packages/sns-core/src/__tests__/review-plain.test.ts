import { describe, expect, it } from "vitest";
import { plainReviewLine, reviewHeadline } from "../review-plain";

describe("검수 문장을 쉬운 말로", () => {
  it("영문 검수 용어를 우리말로 바꾼다", () => {
    // extraCopy·uncertain·changed 는 검수 스키마의 값이다. 화면에 그대로
    // 나오면 무슨 말인지 알 수 없다.
    expect(plainReviewLine("extraCopy는 uncertain 처리")).toContain("원고에 없는 글자");
    expect(plainReviewLine("accent 전체 원고가 (changed)")).toContain("강조 문구");
    expect(plainReviewLine("headline 이 missing")).toContain("빠짐");
  });

  it("바꿀 말이 없으면 그대로 둔다", () => {
    expect(plainReviewLine("오타가 있습니다")).toBe("오타가 있습니다");
  });

  it("빈 줄은 빈 줄로", () => {
    expect(plainReviewLine("")).toBe("");
  });
});

describe("한두 줄 요약", () => {
  it("통과면 통과라고만 한다", () => {
    expect(reviewHeadline("pass", "문제 없음", [])).toBe("문제 없음");
  });

  it("걸린 것이 있으면 몇 가지인지 알려 준다", () => {
    // 요약이 길면 카드가 늘어난다. 몇 가지인지만 먼저 보여주고 자세한 것은 접는다.
    expect(reviewHeadline("fail", "여러 곳이 어긋났습니다", ["가", "나", "다"]))
      .toBe("여러 곳이 어긋났습니다 · 3가지");
  });

  it("요약이 길면 자른다", () => {
    const long = "가".repeat(200);
    expect(reviewHeadline("fail", long, []).length).toBeLessThanOrEqual(90);
  });

  it("요약이 없으면 대신할 말을 준다", () => {
    expect(reviewHeadline("fail", "", ["가"])).toBe("사람이 확인해야 할 곳이 있습니다 · 1가지");
    expect(reviewHeadline("pass", "", [])).toBe("검수를 통과했습니다");
  });
});
