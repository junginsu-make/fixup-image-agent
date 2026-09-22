import { describe, expect, it } from "vitest";
import {
  REVIEW_CRITERIA,
  normalizeReview,
  reviewCompleteness,
  reviewPenalty,
  needsRevision,
} from "./pdp.review";

/**
 * **못 받은 심사를 통과로 바꾸지 않는다.**
 *
 * `normalizeReview` 는 모르는 항목을 버린다. 그래서 모델이 엉뚱한 이름만 내면
 * `items: []` 가 되고, 그 빈 결과는 **fail 이 하나도 없으므로 통과처럼 보인다.**
 * `reviewPenalty` 도 0 이라 재작성 루프가 「가장 좋은 결과」로 채택한다.
 *
 * 설계 §10.1: 「7개 고정 criterion 이 정확히 한 번씩 있어야 complete 다.
 * 모르는 값·중복·누락은 incomplete, 호출 실패는 unavailable 이다.
 * **미검사를 통과로 바꾸지 않는다.**」
 */
const 전부통과 = () => ({
  items: REVIEW_CRITERIA.map((criterion) => ({
    criterion: criterion.id,
    rating: "pass" as const,
    evidence: "",
    fix: "",
  })),
});

describe("심사가 완전한가", () => {
  it("일곱 항목이 한 번씩 있으면 complete", () => {
    expect(reviewCompleteness(전부통과())).toBe("complete");
  });

  it("**비어 있으면 incomplete** — 통과가 아니다", () => {
    expect(reviewCompleteness({ items: [] })).toBe("incomplete");
  });

  it("몇 개만 오면 incomplete", () => {
    const 일부 = { items: 전부통과().items.slice(0, 3) };

    expect(reviewCompleteness(일부)).toBe("incomplete");
  });

  it("**같은 항목이 두 번 오면 incomplete** — 하나는 안 본 것이다", () => {
    const 중복 = { items: [...전부통과().items.slice(0, 6), 전부통과().items[0]!] };

    expect(reviewCompleteness(중복)).toBe("incomplete");
  });

  it("심사를 못 받았으면 unavailable", () => {
    expect(reviewCompleteness(null)).toBe("unavailable");
  });
});

describe("빈 심사를 개선으로 치지 않는다", () => {
  it("**빈 심사의 벌점이 통과보다 낮으면 안 된다**", () => {
    // 전에는 빈 심사가 0 이라 「fail 이 하나 있는 온전한 심사」보다 좋아 보였다.
    const 온전하지만하나실패 = {
      items: 전부통과().items.map((item, index) =>
        index === 0 ? { ...item, rating: "fail" as const } : item,
      ),
    };

    expect(reviewPenalty({ items: [] })).toBeGreaterThan(reviewPenalty(온전하지만하나실패));
  });

  it("온전한 전부 통과가 가장 낮다", () => {
    expect(reviewPenalty(전부통과())).toBe(0);
  });

  it("심사를 못 받은 것이 가장 나쁘다", () => {
    expect(reviewPenalty(null)).toBeGreaterThan(reviewPenalty({ items: [] }));
  });
});

describe("재작성이 필요한가", () => {
  it("fail 이 있으면 필요하다", () => {
    const 하나실패 = {
      items: 전부통과().items.map((item, index) =>
        index === 0 ? { ...item, rating: "fail" as const } : item,
      ),
    };

    expect(needsRevision(하나실패)).toBe(true);
  });

  it("**불완전해도 다시 받아야 한다** — 안 본 항목이 있다", () => {
    expect(needsRevision({ items: [] })).toBe(true);
  });

  it("온전히 통과했으면 그만한다", () => {
    expect(needsRevision(전부통과())).toBe(false);
  });
});

describe("정규화가 무엇을 버렸는지 남긴다", () => {
  it("모르는 항목 이름을 세어 둔다", () => {
    const 결과 = normalizeReview({
      items: [
        { criterion: REVIEW_CRITERIA[0]!.id, rating: "pass" },
        { criterion: "지어낸항목", rating: "pass" },
      ],
    });

    expect(결과.items).toHaveLength(1);
    expect(결과.droppedCount).toBe(1);
  });

  it("아예 목록이 아니면 그것도 남긴다", () => {
    expect(normalizeReview({ items: "이상한값" }).malformed).toBe(true);
  });
});
