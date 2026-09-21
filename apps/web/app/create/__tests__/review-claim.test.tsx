import { readFileSync } from "node:fs";
import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { REVIEW_CRITERIA } from "@fixup/pdp-core";
import { ReviewPanel } from "../ReviewPanel";

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

const 글 = (review: unknown) =>
  JSON.stringify(create(<ReviewPanel review={review as never} />).toJSON());

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
