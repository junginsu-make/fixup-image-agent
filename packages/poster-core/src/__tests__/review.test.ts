import { describe, expect, it, vi } from "vitest";
import { reviewPoster, shouldReviewPoster } from "../review";
import { EMPTY_SLOTS } from "../schemas";

const slots = {
  ...EMPTY_SLOTS,
  headline: "가을, 셔터를 누르다",
  subline: "필름으로 담은 도시의 온도",
  sideTexts: ["ISO 400"],
};

const input = { slots, imageUrl: "https://example.com/out.png", preservedImageUrls: [] as string[] };

const clean = {
  decision: "pass" as const,
  summary: "문제 없음",
  issues: [] as string[],
  textFidelity: { headline: "exact", subline: "exact", sideTexts: "exact" },
  extraCopy: { status: "none", texts: [] as string[] },
};

describe("검수 대상", () => {
  it("고른 변형만 검수한다 — 안 고른 것까지 보면 돈만 나간다", () => {
    expect(shouldReviewPoster({ selected: true })).toBe(true);
    expect(shouldReviewPoster({ selected: false })).toBe(false);
  });
});

describe("포스터 검수", () => {
  it("통과하면 그대로 둔다", async () => {
    const result = await reviewPoster(input, { review: async () => clean });
    expect(result.status).toBe("done");
    expect(result.requiresHumanAction).toBe(false);
  });

  it("빠진 글자가 있으면 모델이 pass 여도 fail 로 바꾼다", async () => {
    const result = await reviewPoster(input, {
      review: async () => ({ ...clean, textFidelity: { ...clean.textFidelity, subline: "missing" } }),
    });
    expect(result.status).toBe("review_required");
    expect(result.review?.decision).toBe("fail");
    expect(result.issues.join("\n")).toMatch(/subline/);
  });

  it("지어낸 글자가 있으면 모델이 pass 여도 fail 로 바꾼다", async () => {
    const result = await reviewPoster(input, {
      review: async () => ({
        ...clean,
        extraCopy: { status: "present", texts: ["© 2024 모든 권리 보유"] },
      }),
    });
    expect(result.status).toBe("review_required");
    expect(result.issues.join("\n")).toContain("© 2024 모든 권리 보유");
  });

  it("카피인지 배경 글자인지 확신 못 하면 사람에게 넘긴다", async () => {
    const result = await reviewPoster(input, {
      review: async () => ({ ...clean, extraCopy: { status: "uncertain", texts: ["OPEN"] } }),
    });
    expect(result.status).toBe("review_required");
  });

  it("빈 칸은 대조 대상이 아니다", async () => {
    const bare = { ...input, slots: { ...EMPTY_SLOTS, headline: "제목만" } };
    const result = await reviewPoster(bare, {
      review: async () => ({
        ...clean,
        textFidelity: { headline: "exact", subline: "not_applicable", sideTexts: "not_applicable" },
      }),
    });
    expect(result.status).toBe("done");
  });

  it("자동으로 다시 만들지 않는다", async () => {
    const regenerate = vi.fn();
    await reviewPoster(input, {
      review: async () => ({ ...clean, decision: "fail" }),
      regenerate,
    } as never);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("검수가 실패하면 이미지를 남기고 사람에게 넘긴다", async () => {
    const result = await reviewPoster(input, {
      review: async () => { throw new Error("비전 실패"); },
    });
    expect(result.status).toBe("review_required");
    expect(result.review).toBeUndefined();
    expect(result.issues.join("\n")).toMatch(/비전 실패/);
  });

  it("주 검수가 실패하고 예비가 성공하면 사실을 남긴다", async () => {
    const result = await reviewPoster(input, {
      review: async () => { throw new Error("주 실패"); },
    }, { review: async () => clean });
    expect(result.status).toBe("done");
    expect(result.issues.join("\n")).toMatch(/예비.*주 실패/);
  });

  it("판정 칸이 빠진 응답은 통과시키지 않는다", async () => {
    const { textFidelity: _drop, ...withoutFidelity } = clean;
    const result = await reviewPoster(input, { review: async () => withoutFidelity });
    expect(result.status).toBe("review_required");
  });

  it("보존 대상이 있으면 원본을 함께 보여준다", async () => {
    const seen: string[][] = [];
    await reviewPoster(
      { ...input, preservedImageUrls: ["https://example.com/product.png"] },
      { review: async (call) => { seen.push(call.preservedImageUrls); return clean; } },
    );
    expect(seen[0]).toEqual(["https://example.com/product.png"]);
  });
});
