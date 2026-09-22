import { describe, expect, it } from "vitest";
import { REVIEW_STALE_NOTICE, isReviewStale, reviewStampOf } from "./pdp.review-freshness";
import type { LandingPageBlueprint } from "./types";

/**
 * **그 심사가 지금 구성안을 본 것인가**(N-3, 설계 §9.3·§10.1).
 *
 * 심사 결과는 한 번 받으면 그대로 남았다. 사용자가 섹션을 지우거나 제목을
 * 고쳐도 **「모두 통과했습니다」가 그대로 붙어 있었다.**
 */

const 섹션 = (patch: Record<string, unknown> = {}) =>
  ({
    section_id: "S1", section_name: "히어로", goal: "관심",
    headline: "오늘 시작하세요", subheadline: "부제", bullets: ["하나", "둘"],
    trust_or_objection_line: "30일 환불됩니다", CTA: "", prompt_ko: "", prompt_en: "", layout_notes: "",
    ...patch,
  }) as never;

const 구성안 = (patch: Partial<LandingPageBlueprint> = {}): LandingPageBlueprint =>
  ({ executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [섹션()], ...patch }) as LandingPageBlueprint;

describe("심사가 본 것을 적어 둔다", () => {
  it("**같은 구성안이면 같은 자국이다**", () => {
    expect(reviewStampOf(구성안())).toBe(reviewStampOf(구성안()));
  });

  it("**구성안이 없으면 빈 자국이다** — 없는 것을 낡았다고 하지 않는다", () => {
    expect(reviewStampOf(null)).toBe("");
    expect(reviewStampOf(undefined)).toBe("");
  });

  it("**섹션이 없어도 안 터진다**", () => {
    expect(() => reviewStampOf({ sections: undefined } as never)).not.toThrow();
  });
});

/**
 * **심사가 보는 것만 센다.**
 *
 * `buildReviewPrompt` 는 구성안의 문구와 섹션 구성을 준다. 이미지나 레이어는
 * 안 본다. 무관한 변화로 낡았다고 하면 사용자는 **이미지를 만들 때마다**
 * 심사를 다시 받아야 한다.
 */
describe("무엇이 바뀌면 낡는가", () => {
  const 처음 = reviewStampOf(구성안());

  it("**카피를 고치면 낡는다** — 심사가 보는 칸들이다", () => {
    const 고친것: Array<[string, Record<string, unknown>]> = [
      ["제목", { headline: "내일 시작하세요" }],
      ["부제", { subheadline: "다른 부제" }],
      ["항목", { bullets: ["하나"] }],
      ["신뢰 문장", { trust_or_objection_line: "다른 문장" }],
      ["섹션 이름", { section_name: "다른 이름" }],
    ];

    for (const [label, patch] of 고친것) {
      expect(isReviewStale(처음, 구성안({ sections: [섹션(patch)] })), label).toBe(true);
    }
  });

  it("**전략을 고치면 낡는다**", () => {
    expect(isReviewStale(처음, 구성안({ executiveSummary: "다른 전략" }))).toBe(true);
  });

  it("**섹션을 더하면 낡는다**", () => {
    expect(isReviewStale(처음, 구성안({ sections: [섹션(), 섹션({ section_id: "S2" })] }))).toBe(true);
  });

  it("**섹션을 지우면 낡는다**", () => {
    expect(isReviewStale(처음, 구성안({ sections: [] }))).toBe(true);
  });

  it("**차례를 바꾸면 낡는다** — 심사 항목에 흐름이 있다", () => {
    const 둘 = [섹션(), 섹션({ section_id: "S2", headline: "둘째" })];
    const 원래 = reviewStampOf(구성안({ sections: 둘 }));

    expect(isReviewStale(원래, 구성안({ sections: [둘[1]!, 둘[0]!] as never }))).toBe(true);
  });

  /**
   * **이미지가 생겨도 안 낡는다.** 심사는 그림을 안 본다. 여기서 낡았다고
   * 하면 한 장 만들 때마다 심사가 경고를 단다.
   */
  it("**이미지를 만들어도 안 낡는다**", () => {
    const 그림있음 = 구성안({ sections: [섹션({ generatedImage: "data:image/png;base64,AAA" })] });

    expect(isReviewStale(처음, 그림있음)).toBe(false);
  });

  it("**장면 지시를 고쳐도 안 낡는다** — 심사는 카피와 구성을 본다", () => {
    const 장면바뀜 = 구성안({ sections: [섹션({ prompt_ko: "다른 장면", prompt_en: "another scene" })] });

    expect(isReviewStale(처음, 장면바뀜)).toBe(false);
  });

  it("**아무것도 안 바꾸면 안 낡는다**", () => {
    expect(isReviewStale(처음, 구성안())).toBe(false);
  });
});

/**
 * **자국이 없으면 낡았다고 하지 않는다.**
 *
 * 옛 초안에는 이 값이 없다. 없는 것을 낡았다고 하면 멀쩡한 심사가 전부 경고를
 * 달고 뜨고, 그러면 사용자는 경고 전체를 무시한다.
 */
describe("옛 초안을 나무라지 않는다", () => {
  it("**자국이 없으면 안 낡았다고 본다**", () => {
    expect(isReviewStale(undefined, 구성안())).toBe(false);
    expect(isReviewStale("", 구성안())).toBe(false);
  });

  /**
   * **대조할 것이 없으면 판단하지 않는다.** 구성안을 안 넘기는 자리가 있다.
   * 그때 「낡았다」고 하면 멀쩡한 심사가 경고를 달고 뜬다.
   */
  it("**지금 구성안을 모르면 안 낡았다고 본다**", () => {
    expect(isReviewStale(reviewStampOf(구성안()), null)).toBe(false);
    expect(isReviewStale(reviewStampOf(구성안()), undefined)).toBe(false);
  });
});

describe("낡은 심사 옆에 붙일 말", () => {
  it("**고치기 전 결과라고 말한다**", () => {
    expect(REVIEW_STALE_NOTICE).toContain("고치기 전");
  });

  it("**지금 것은 아직 안 봤다고 말한다** — 통과로 읽히면 안 된다", () => {
    expect(REVIEW_STALE_NOTICE).toContain("아직");
  });

  it("**줄표를 안 쓴다**", () => {
    expect(REVIEW_STALE_NOTICE).not.toContain("—");
  });
});
