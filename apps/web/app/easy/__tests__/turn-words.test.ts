import { describe, expect, it } from "vitest";
import { KIND_QUESTION, RATIO_QUESTION, aiText, askText, photoQuestion } from "../turn-words";

/**
 * **물음 문장**(2026-10-07 2차 설계 §3-4). 갈래 · 모양 물음은 판단과 같은 호출의 reply 를 쓴다.
 * 물음으로 쓴 글이 아니면(비었거나 「만들겠습니다」) 고정 문장으로 대신한다.
 */
describe("물음 문장", () => {
  it("AI 가 물음으로 쓴 글이면 그것, 아니면 고정 문장", () => {
    expect(askText("세로로 만들까요, 정사각형으로 만들까요?", RATIO_QUESTION)).toBe("세로로 만들까요, 정사각형으로 만들까요?");
    expect(askText("포스터를 만들겠습니다.", RATIO_QUESTION)).toBe(RATIO_QUESTION);
    expect(askText("  ", KIND_QUESTION)).toBe(KIND_QUESTION);
    expect(askText(undefined, KIND_QUESTION)).toBe(KIND_QUESTION);
  });

  /** 2차 최종 리뷰 3 — 프롬프트가 「묻고, 안 골라도 정사각형이라고 덧붙이라」고 시킨다. 물음 뒤 설명이 붙는다. */
  it("물음 뒤에 설명이 붙어도 AI 물음이다 — 「?」가 어디든 있으면", () => {
    const 물음 = "세로로 할까요, 정사각형으로 할까요? 안 고르시면 정사각형으로 만듭니다.";
    expect(askText(물음, RATIO_QUESTION)).toBe(물음);
    expect(askText("한 장으로 만들까요？ 여러 장도 됩니다.", KIND_QUESTION)).toBe("한 장으로 만들까요？ 여러 장도 됩니다.");
  });

  /** 2차 최종 리뷰 b — 코드가 갈래를 바꿔 읽으면 그 reply 는 다른 일을 하겠다고 쓴 글이다. */
  it("지금 실행하는 갈래로 쓴 reply 만 AI 글로 받는다", () => {
    expect(aiText({ wants: "image", reply: "세로로 할까요?" }, "image")).toBe("세로로 할까요?");
    expect(aiText({ wants: "talk", reply: "무엇을 도와드릴까요?" }, "image")).toBeUndefined();
    expect(askText(aiText({ wants: "talk", reply: "무엇을 도와드릴까요?" }, "image"), RATIO_QUESTION)).toBe(RATIO_QUESTION);
  });

  it("사진 물음은 고정 문장이다(2차 §4)", () => {
    expect(photoQuestion("unclear")).toBe("사진을 어떻게 쓸지 알려 주세요.");
    expect(photoQuestion("people")).toContain("한 장만 「인물 그대로」로 골라 주세요");
  });

  it("고정 문장에 줄표가 없다", () => {
    for (const one of [KIND_QUESTION, RATIO_QUESTION, photoQuestion("unclear"), photoQuestion("people")]) expect(one).not.toContain("—");
  });
});
