import { describe, expect, it } from "vitest";
import { ANGLE_KEYWORD_RULES, explainAngleForSection } from "./pdp.character";
import { pickAngleForSection, resolveCharacterAngles } from "./pdp.character";

/**
 * **자동은 판단이 아니라 낱말 대조다**(U-05).
 *
 * 화면은 「자동은 섹션 설명을 **읽어** 어울리는 각도를 하나씩 고릅니다」라고
 * 말했다. 실제로는 정규식 몇 개를 대조하고, 아무것도 안 걸리면 **좌측 45도로
 * 굳는다.** 리디자인 경로는 `layoutNotes` 가 늘 비어 있어 **언제나** 좌측 45도다.
 *
 * 그것이 나쁜 규칙이라는 말이 아니다 — 잘 돈다. 나쁜 것은 **판단처럼 보이게
 * 말한 것**이다. 사용자는 「AI 가 봤겠지」 하고 넘기고, 왜 이 각도인지 물을
 * 생각을 못 한다.
 *
 * 설계 §9.1(U-05): 「자동 정책을 설명하고 사용자 override 유지.
 * **AI 판정처럼 표시하지 않음**」.
 */

describe("무엇을 보고 골랐는지 말한다", () => {
  it("**걸린 낱말을 돌려준다**", () => {
    const 고른것 = explainAngleForSection("뒷모습으로 걸어가는 장면");

    expect(고른것.angle).toBe("back");
    expect(고른것.reason).toBe("keyword");
    expect(고른것.matched).toBe("뒷모습");
  });

  it("영어 낱말도 돌려준다", () => {
    expect(explainAngleForSection("shot from behind").matched).toBe("from behind");
  });

  it("**아무것도 안 걸리면 기본값이라고 말한다**", () => {
    const 고른것 = explainAngleForSection("밝은 스튜디오에서 제품을 든 장면");

    expect(고른것.angle).toBe("left_45");
    expect(고른것.reason).toBe("default");
    expect(고른것.matched).toBeUndefined();
  });

  it("**설명이 비어도 기본값이다** — 리디자인 경로가 늘 이 자리다", () => {
    expect(explainAngleForSection("").reason).toBe("default");
  });
});

/** 각도 선택 fixture. 표로 두면 규칙이 늘 때 한 줄로 끝난다. */
describe("각도 선택 fixture", () => {
  it.each([
    ["뒷모습으로 서 있다", "back"],
    ["뒤돌아 걷는다", "back"],
    ["walking away from camera", "back"],
    ["back view of the model", "back"],
    ["정면을 보고 웃는다", "front"],
    ["얼굴 클로즈업", "front"],
    ["close-up portrait", "front"],
    ["facing camera", "front"],
    ["오른쪽을 보고 선다", "right_45"],
    ["우측을 향한다", "right_45"],
    ["facing right", "right_45"],
    ["제품을 들고 웃는다", "left_45"],
    ["", "left_45"],
  ])("%s → %s", (notes, expected) => {
    expect(pickAngleForSection(notes)).toBe(expected);
  });

  /**
   * **차례가 곧 우선순위다.**
   *
   * 한 설명에 여러 낱말이 걸리면 먼저 적힌 규칙이 이긴다. 차례를 바꾸면 같은
   * 설명에 다른 각도가 나온다 — 겹치는 예가 없으면 그 뒤집힘이 안 보인다.
   */
  it.each([
    ["뒷모습 클로즈업", "back"],
    ["오른쪽에서 본 뒷모습", "back"],
    ["정면 클로즈업, 오른쪽 여백", "front"],
  ])("겹치면 먼저 적힌 것이 이긴다: %s → %s", (notes, expected) => {
    expect(pickAngleForSection(notes)).toBe(expected);
  });

  it("**규칙마다 화면에 적을 예시가 있다** — 없으면 안내가 빈 괄호가 된다", () => {
    for (const rule of ANGLE_KEYWORD_RULES) {
      expect(rule.examples.length).toBeGreaterThan(0);
      // 예시는 그 규칙에 실제로 걸리는 말이어야 한다. 아니면 안내가 거짓이다.
      for (const example of rule.examples) expect(pickAngleForSection(example)).toBe(rule.angle);
    }
  });
});

describe("사람이 고른 것이 여전히 이긴다", () => {
  it("고른 각도를 그대로 쓴다", () => {
    expect(resolveCharacterAngles(["front", "back"], "뒷모습")).toEqual(["front", "back"]);
  });

  it("안 골랐으면 자동이 돈다", () => {
    expect(resolveCharacterAngles([], "뒷모습으로")).toEqual(["back"]);
  });
});

/*
  화면 문구는 웹 쪽 시험이 값으로 잰다
  (`apps/web/app/create/__tests__/auto-angle-hint.test.ts`). 문구가 보간이라
  소스 대조로는 규칙 표를 실제로 쓰는지 알 수 없다.
*/
