import { describe, expect, it, vi } from "vitest";
import { buildReviewPrompt, reviewCard, shouldReview, type ReviewRequest } from "../review";

const base = {
  kind: "generated" as const,
  imageUrl: "https://example.com/card.png",
  copy: { headline: "제목", body: "본문" },
  preservedImageUrls: [] as string[],
};
const exactFidelity = { headline: "exact", body: "exact", accent: "not_applicable", footnote: "not_applicable" } as const;

describe("검수 프롬프트", () => {
  it("기대 글자를 담는다", () => {
    expect(buildReviewPrompt({ copy: { headline: "제목", body: "본문" }, hasPreserved: false }))
      .toContain("제목");
  });

  it("그대로 넣을 것이 있으면 원본과 대조를 지시한다", () => {
    expect(buildReviewPrompt({ copy: { headline: "x" }, hasPreserved: true })).toMatch(/원본|대조/);
  });

  it("프롬프트가 아니라 실제 이미지를 보라고 한다", () => {
    expect(buildReviewPrompt({ copy: { headline: "x" }, hasPreserved: false })).toMatch(/실제로 보이는/);
  });

  it("비어 있지 않은 원고 필드를 통째로 대조하고 누락·요약이면 fail 하라고 한다", () => {
    const prompt = buildReviewPrompt({ copy: { headline: "제목", body: "긴 본문", accent: "강조", footnote: "각주" }, hasPreserved: false });
    expect(prompt).toMatch(/headline.*body.*accent.*footnote/is);
    expect(prompt).toMatch(/통째로|전체 문자열/);
    expect(prompt).toMatch(/누락|요약/);
    expect(prompt).toMatch(/반드시 fail/);
  });

  it("점수나 숫자 문턱을 만들지 않는다", () => {
    expect(buildReviewPrompt({ copy: { headline: "x" }, hasPreserved: false }))
      .not.toMatch(/score|점수|100점|90점|threshold/i);
  });
});

describe("검수 대상", () => {
  it("AI 가 그린 카드만 검수한다", () => {
    expect(shouldReview({ kind: "generated" })).toBe(true);
  });

  it("원본 그대로 쓴 장은 검수하지 않는다", () => {
    expect(shouldReview({ kind: "place_as_is", reviewRequired: false })).toBe(false);
  });

  it("사용자가 올린 마지막 장도 검수하지 않는다", () => {
    expect(shouldReview({ kind: "ending_image" })).toBe(false);
  });

  it("reviewRequired false 는 종류와 무관하게 건너뛴다", () => {
    expect(shouldReview({ kind: "generated", reviewRequired: false })).toBe(false);
  });
});

describe("검수", () => {
  it("통과하면 done 으로 돌려준다", async () => {
    const result = await reviewCard(base, {
      review: async () => ({ decision: "pass", summary: "문제 없음", issues: [], textFidelity: exactFidelity }),
    });
    expect(result).toMatchObject({
      status: "done",
      review: { decision: "pass", summary: "문제 없음" },
      requiresHumanAction: false,
      autoRegenerated: false,
      issues: [],
    });
  });

  it("반려하면 이미지를 버리지 않고 사람이 보게 한다", async () => {
    const result = await reviewCard(base, {
      review: async () => ({
        decision: "fail", summary: "제목 오탈자", issues: ["제목이 다르게 보입니다."],
        textFidelity: { ...exactFidelity, headline: "changed" },
      }),
    });
    expect(result).toMatchObject({
      status: "review_required",
      review: { decision: "fail", summary: "제목 오탈자" },
      requiresHumanAction: true,
      autoRegenerated: false,
    });
  });

  it("모델이 pass라고 해도 비어 있지 않은 body가 missing이면 review_required로 닫는다", async () => {
    const result = await reviewCard(base, {
      review: async () => ({
        decision: "pass",
        summary: "의미는 전달됨",
        issues: ["본문이 요약됨"],
        textFidelity: { headline: "exact", body: "missing", accent: "not_applicable", footnote: "not_applicable" },
      }),
    });
    expect(result.status).toBe("review_required");
    expect(result.review?.decision).toBe("fail");
    expect(result.review?.issues.join("\n")).toContain("body");
  });

  it("필드별 원문 대조 결과를 빠뜨린 검수 응답은 통과시키지 않는다", async () => {
    const result = await reviewCard(base, {
      review: async () => ({ decision: "pass", summary: "문제 없음", issues: [] }),
    });
    expect(result.status).toBe("review_required");
    expect(result.issues.join("\n")).toContain("주 검수 실패");
  });

  it("검수 제외 카드는 제공자를 부르지 않는다", async () => {
    const review = vi.fn(async () => ({ decision: "pass" as const, summary: "x", issues: [] }));
    const result = await reviewCard({ ...base, kind: "place_as_is" }, { review });
    expect(result).toEqual({
      status: "skipped",
      review: undefined,
      issues: [],
      requiresHumanAction: false,
      autoRegenerated: false,
    });
    expect(review).not.toHaveBeenCalled();
  });

  it("주 검수가 실패하고 예비가 없으면 이유를 남긴다", async () => {
    const result = await reviewCard(base, {
      review: async () => { throw new Error("비전 모델 없음"); },
    });
    expect(result.status).toBe("review_required");
    expect(result.review).toBeUndefined();
    expect(result.issues).toEqual([
      "주 검수 실패: 비전 모델 없음",
      "OpenAI 예비 검수가 설정되지 않았습니다.",
    ]);
    expect(result.requiresHumanAction).toBe(true);
  });

  it("주 검수 실패 후 예비가 성공하면 결과와 경고를 남긴다", async () => {
    const result = await reviewCard(
      base,
      { review: async () => { throw new Error("Claude vision 실패"); } },
      { review: async () => ({ decision: "pass", summary: "예비 통과", issues: [], textFidelity: exactFidelity }) },
    );
    expect(result.status).toBe("done");
    expect(result.review?.decision).toBe("pass");
    expect(result.issues).toEqual(["주 검수가 실패해 OpenAI 예비로 검수했습니다: Claude vision 실패"]);
  });

  it("두 검수가 모두 실패하면 두 이유가 남는다", async () => {
    const result = await reviewCard(
      base,
      { review: async () => { throw new Error("Claude vision 실패"); } },
      { review: async () => { throw new Error("OpenAI vision 실패"); } },
    );
    expect(result.status).toBe("review_required");
    expect(result.issues).toEqual([
      "주 검수 실패: Claude vision 실패",
      "OpenAI 예비 검수도 실패했습니다: OpenAI vision 실패",
    ]);
  });

  it("규칙에 안 맞는 판정도 이유를 남긴다", async () => {
    const result = await reviewCard(base, {
      review: async () => ({ decision: "아마도" }) as never,
    });
    expect(result.status).toBe("review_required");
    expect(result.issues[0]).toContain("주 검수 실패");
  });

  it("추가로 들어온 재생성 함수도 호출하지 않는다", async () => {
    const regenerate = vi.fn(async () => undefined);
    const input = { ...base, regenerate } as typeof base;
    const request: ReviewRequest = {
      review: async () => ({
        decision: "fail", summary: "사람 확인", issues: ["문제"],
        textFidelity: { ...exactFidelity, headline: "changed" },
      }),
    };
    const result = await reviewCard(input, request);
    expect(result.autoRegenerated).toBe(false);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
