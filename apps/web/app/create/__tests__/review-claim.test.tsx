import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { REVIEW_CRITERIA, reviewStampOf } from "@fixup/pdp-core";
import { ReviewPanel } from "../ReviewPanel";
import { ScorecardPanel } from "../ScorecardPanel";

/**
 * **모델이 스스로 본 것을 합격이라고 말하고 있었다**(U-16).
 *
 * 설계 §14.5: 「실제 판매 효과 근거 없음 | **성과 검증 미완으로 명시, 모델
 * 점수와 분리** | W9 보고. **전환율 개선을 출시 합격으로 위장하지 않음**」.
 *
 * 구성안 심사는 **같은 AI 가 제 결과를 다시 읽고 매긴 점수**다. 그런데 화면은
 * 이렇게 말했다.
 *
 *   「판매 원칙 심사를 **모두 통과했습니다**」
 *   「일곱 항목을 별도 심사에서 **확인했습니다**」
 *
 * 사람이 읽으면 「이 페이지는 검증을 통과했다」로 읽힌다. **실제로 팔리는지는
 * 아무도 재지 않았다.** 이 저장소에는 전환율 데이터가 한 줄도 없다.
 *
 * ── 왜 값으로 재 두나 ───────────────────────────────────────
 *
 * 이 문구는 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고 시험도 통과한다.
 * 그래서 다시 스며든다 — 값으로 재 두지 않으면.
 */

const 모두통과 = {
  items: REVIEW_CRITERIA.map((criterion) => ({
    criterion: criterion.id,
    rating: "pass" as const,
    evidence: "",
    fix: "",
  })),
};

const 걸린것 = {
  items: REVIEW_CRITERIA.map((criterion, index) => ({
    criterion: criterion.id,
    rating: index === 0 ? ("fail" as const) : ("pass" as const),
    evidence: "대상이 「누구나」로 적혀 있다",
    fix: "한 사람을 떠올릴 만큼 좁혀라",
  })),
};

const 글 = (review: unknown, blueprint?: unknown) =>
  JSON.stringify(create(<ReviewPanel review={review as never} blueprint={blueprint as never} />).toJSON());

describe("심사 결과를 성과라고 하지 않는다", () => {
  /**
   * **제목에 AI 가 붙은 것만으로는 모자라다.**
   *
   * 처음 시험은 화면 어디든 「AI」가 있으면 통과였다. 그런데 제목이 이미
   * 「AI 판매 원칙 심사…」라서, **한계 문구에서 「AI 가 스스로 본」을 빼도
   * 초록**이었다(2026-09-21 변이에서 드러남).
   */
  it.each([["모두 통과", 모두통과], ["걸린 것 있음", 걸린것]])(
    "**%s 일 때 누가 본 것인지 말한다**",
    (_label, review) => {
      expect(글(review)).toContain("AI 가 스스로 본");
    },
  );

  /**
   * **실제 판매 효과는 안 쟀다는 말이 있어야 한다.** 없으면 사용자는 이
   * 표시를 성과 보증으로 읽는다.
   */
  it("**실제 판매 효과는 확인하지 않았다고 말한다**", () => {
    const text = 글(모두통과);

    expect(text).toMatch(/판매 효과|실제로 팔리는지|성과/);
    expect(text).toMatch(/확인하지 않|재지 않|보장하지 않/);
  });

  it("**전환율이 올랐다고 하지 않는다**", () => {
    for (const review of [모두통과, 걸린것]) {
      const text = 글(review);

      expect(text).not.toContain("전환율이 오");
      expect(text).not.toContain("매출");
      expect(text).not.toContain("전환율 개선");
    }
  });

  /**
   * **걸린 것이 있을 때도 같은 한계가 있다.** 한쪽에만 적으면 통과했을 때만
   * 겸손한 꼴이 된다.
   */
  it("**걸린 것이 있을 때도 한계를 말한다**", () => {
    expect(글(걸린것)).toMatch(/판매 효과|실제로 팔리는지|성과/);
  });

  it("**사용자에게 보이는 말에 줄표를 안 쓴다**", () => {
    expect(글(모두통과)).not.toContain("—");
  });
});

/**
 * **소개 문서도 같은 말을 해야 한다.** 화면만 고치고 문서가 「전환율 중심」이라고
 * 하면, 값을 묻는 사람은 문서를 읽는다.
 */
describe("소개 문서가 성과를 주장하지 않는다", () => {
  const readme = readFileSync(new URL("../../../../../README.md", import.meta.url), "utf8");

  /**
   * **낱말만 보면 반대로 적어도 통과한다.** 처음 시험은 「성과 검증」이나
   * 「판매 효과」가 어디든 있으면 초록이었다 — 「성과가 좋습니다」로 바꿔도
   * 옆 문장에 걸려 안 잡혔다.
   */
  it("**성과 검증을 하지 않았다고 적혀 있다**", () => {
    expect(readme).toMatch(/성과 검증은 하지 않았습니다/);
  });

  it("**심사 점수를 판매 효과라고 하지 않는다**", () => {
    expect(readme).toMatch(/판매 효과가 아닙니다/);
  });
});

/**
 * **고친 구성안에 옛 심사의 「통과」를 붙이지 않는다**(N-3, 설계 §9.3).
 *
 * 심사 결과는 한 번 받으면 그대로 남았다. 사용자가 섹션을 지우거나 제목을
 * 고쳐도 **「모두 통과했습니다」가 그대로 붙어 있었다.** 사용자는 고친
 * 구성안이 검사를 통과한 줄 안다.
 *
 * 설계 §9.3: 「변경 후 기존 심사 결과는 **stale 표시**. '이전 구성안 심사
 * 통과'를 새 구성안에 붙이지 않는다」.
 */
describe("지난 구성안의 심사를 통과라고 하지 않는다", () => {
  const 섹션 = (headline: string) =>
    ({
      section_id: "S1", section_name: "히어로", goal: "관심",
      headline, subheadline: "", bullets: [], trust_or_objection_line: "",
      CTA: "", prompt_ko: "", prompt_en: "", layout_notes: "",
    }) as never;

  const 구성안 = (headline: string) =>
    ({ executiveSummary: "전략", scorecard: [], blueprintList: [], sections: [섹션(headline)] }) as never;

  const 심사받은구성안 = 구성안("오늘 시작하세요");
  const 자국 = reviewStampOf(심사받은구성안);

  it("**구성안을 고치면 통과라고 안 한다**", () => {
    const 고친뒤 = 글({ ...모두통과, stamp: 자국 }, 구성안("내일 시작하세요"));

    expect(고친뒤).not.toContain("모두 통과했습니다");
    expect(고친뒤).toContain("지난 구성안의 심사 결과입니다");
  });

  /**
   * **제목만 바꾸는 것으로는 부족하다.** 본문의 「일곱 항목을 별도 심사에서
   * 확인했습니다」가 남으면 그것이 곧 통과로 읽힌다.
   */
  it("**낡으면 확인했다는 말도 안 한다**", () => {
    const 고친뒤 = 글({ ...모두통과, stamp: 자국 }, 구성안("내일 시작하세요"));

    expect(고친뒤).not.toContain("확인했습니다");
  });

  it("**무엇을 해야 하는지 말한다** — 통과가 아니라고만 하면 사용자는 멈춘다", () => {
    const 고친뒤 = 글({ ...모두통과, stamp: 자국 }, 구성안("내일 시작하세요"));

    expect(고친뒤).toContain("아직 검사하지 않았습니다");
  });

  it("**안 고쳤으면 그대로 통과라고 한다**", () => {
    const 그대로 = 글({ ...모두통과, stamp: 자국 }, 심사받은구성안);

    expect(그대로).toContain("모두 통과했습니다");
    expect(그대로).not.toContain("지난 구성안");
  });

  /**
   * **옛 초안을 나무라지 않는다.** 자국이 없는 심사는 이 기능이 생기기 전
   * 것이다. 그것을 전부 「지난 구성안」이라고 하면 사용자는 경고를 무시한다.
   */
  it("**자국이 없으면 그대로 보여 준다**", () => {
    expect(글(모두통과, 구성안("아무 제목"))).toContain("모두 통과했습니다");
  });

  it("**구성안을 안 넘기면 그대로 보여 준다** — 알 방법이 없다", () => {
    expect(글({ ...모두통과, stamp: 자국 })).toContain("모두 통과했습니다");
  });

  it("**걸린 것이 있는 심사도 낡으면 그렇게 말한다**", () => {
    const 고친뒤 = 글({ ...걸린것, stamp: 자국 }, 구성안("내일 시작하세요"));

    expect(고친뒤).toContain("지난 구성안의 심사 결과입니다");
  });
});

/**
 * **심사가 없을 때 뜨는 자기 채점표**(N-4, 설계 §9.3).
 *
 * 설계: 「`scorecard` 의 **작성자 자기평가**를 독립 심사나 판매 효과 점수로
 * 표시하지 않는다」.
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────
 *
 * 심사 호출이 실패하면(`runReview` 가 `null` 을 준다) 화면은 `scorecard` 를
 * 그대로 그린다. 거기에는 **A/B 등급 배지**가 붙는다. 그런데 그것은
 * 「구성안을 쓴 바로 그 호출이 같은 자리에서 스스로 매긴 점수」다.
 *
 * `ReviewPanel` 안에만 있는 「AI 가 스스로 본 결과입니다」 문구는 **이
 * 갈래에서는 안 뜬다.** 등급만 남는다. 사람이 읽으면 검증된 점수로 읽힌다.
 */
describe("자기 채점표를 심사처럼 보이게 하지 않는다", () => {
  const 채점표 = readFileSync(new URL("../ScorecardPanel.tsx", import.meta.url), "utf8");

  it("**작성자 자기평가라고 말한다**", () => {
    expect(채점표).toContain("스스로 매긴");
  });

  it("**심사가 아니라고 말한다** — 등급만 두면 검증으로 읽힌다", () => {
    expect(채점표).toContain("심사가 아닙니다");
  });

  it("**판매 효과를 확인하지 않았다고 말한다**", () => {
    expect(채점표).toContain("판매 효과");
  });

  /**
   * **문구를 파일에 적어 두는 것과 화면에 그리는 것은 다르다**(X-07 의 교훈).
   */
  it("**실제로 화면에 그린다**", () => {
    const 글 = JSON.stringify(
      create(<ScorecardPanel scorecard={[{ category: "대상", score: "A", reason: "좁혔다" }] as never} />).toJSON(),
    );

    expect(글).toContain("스스로 매긴");
    expect(글).toContain("대상");
  });

  /**
   * **등급에 색을 입히지 않는다.** A 를 초록으로 칠하면 「검사를 통과했다」로
   * 읽힌다. 스스로 매긴 점수에 그런 무게를 주면 안 된다.
   */
  it("**A 등급을 초록으로 칠하지 않는다**", () => {
    const 칠 = (score: string) =>
      JSON.stringify(
        create(<ScorecardPanel scorecard={[{ category: "대상", score, reason: "" }] as never} />).toJSON(),
      );

    /*
      **`variant="green"` 을 찾으면 안 잡힌다.** `Badge` 가 그 값을 클래스로
      바꾼다(`bg-primary-soft text-primary`). 그려진 것을 본다.
    */
    expect(칠("A")).not.toContain("bg-primary-soft");
    // 등급이 달라도 **같은 차림**이어야 한다. 색으로 서열을 매기지 않는다.
    expect(칠("A").replace(/"A"/g, '"?"')).toBe(칠("C").replace(/"C"/g, '"?"'));
  });

  it("**채점표가 없으면 아무것도 안 그린다**", () => {
    expect(create(<ScorecardPanel scorecard={[] as never} />).toJSON()).toBeNull();
  });

  it("**줄표를 안 쓴다**", () => {
    expect(채점표.split("SELF_SCORE_NOTE")[1]?.slice(0, 200) ?? "").not.toContain("—");
  });
});
