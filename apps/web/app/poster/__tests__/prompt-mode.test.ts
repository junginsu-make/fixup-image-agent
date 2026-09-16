import { describe, expect, it } from "vitest";
import { looksFinished, PROMPT_MODES, type PromptMode } from "../prompt-mode";

/**
 * **완성된 프롬프트로 보이는가.**
 *
 * 01 에 200줄짜리 JSON 프롬프트를 넣은 사용자가 그것을 통째로 잃었다 — 기획이
 * 슬롯 11칸으로 요약했고, 칸에 자리가 없는 것은 소리 없이 버려졌다
 * (2026-09-16 사용자 보고).
 *
 * **판별은 하되 결정은 안 한다.** 알아채면 묻기만 하고, 고르는 것은 사람이
 * 한다(설계 §3.1). 그래서 **오탐보다 미탐이 낫다** — 못 알아채도 아래 「직접 쓴
 * 프롬프트」 칸이 받아 주지만, 짧은 메모에 대고 물으면 성가시기만 하다.
 */

describe("완성된 프롬프트 알아보기", () => {
  it("JSON 덩어리는 알아본다", () => {
    expect(looksFinished('{"subject": {"description": "a cat on a chair"}}')).toBe(true);
  });

  /** 앞뒤 공백이나 코드 울타리가 붙어 와도 알아봐야 한다. */
  it("코드 울타리가 붙어 있어도 알아본다", () => {
    expect(looksFinished('```json\n{"scene": "밤바다"}\n```')).toBe(true);
    expect(looksFinished('  \n {"scene": "밤바다"} \n ')).toBe(true);
  });

  /** 배열로 시작하는 프롬프트도 있다. */
  it("배열도 알아본다", () => {
    expect(looksFinished('[{"shot": "wide"}, {"shot": "close"}]')).toBe(true);
  });

  /**
   * JSON 이 아니어도 **길고 여러 줄이면** 공들여 쓴 것이다. 그걸 요약해
   * 버리면 아깝다.
   */
  it("길고 여러 줄인 글도 알아본다", () => {
    const long = Array.from({ length: 8 }, (_, index) =>
      `${index + 1}. 조명은 창문에서 들어오는 자연광이고 그림자는 부드럽게 떨어진다`).join("\n");

    expect(looksFinished(long)).toBe(true);
  });

  /** 이것이 이 판별의 기본값이다 — 대부분의 사용자는 이렇게 쓴다. */
  it("한두 줄짜리 보통 지시는 안 건드린다", () => {
    expect(looksFinished("필름 카메라 감성의 사진전 포스터")).toBe(false);
    expect(looksFinished("가을 사진전 포스터\n따뜻한 색으로")).toBe(false);
  });

  /** 줄만 많고 짧은 것은 메모다. 물어보면 성가시다. */
  it("짧은 줄이 여러 개면 안 건드린다", () => {
    expect(looksFinished("가을\n사진전\n포스터\n따뜻하게\n필름")).toBe(false);
  });

  /** 길어도 한 문단이면 그냥 설명이다. 기획이 읽어 주는 편이 낫다. */
  it("한 줄로 길게 쓴 것은 안 건드린다", () => {
    expect(looksFinished("가을 사진전 포스터인데 ".repeat(30))).toBe(false);
  });

  it("빈 칸은 안 건드린다", () => {
    expect(looksFinished("")).toBe(false);
    expect(looksFinished("   \n  ")).toBe(false);
  });

  /** 중괄호로 시작해도 JSON 이 아니면 아니다. 지어내지 않는다. */
  it("JSON 인 척하는 것은 JSON 으로 안 본다", () => {
    expect(looksFinished("{배경은 밤}")).toBe(false);
  });
});

describe("갈래는 둘뿐이다", () => {
  it("쓴 그대로와 다듬어서", () => {
    expect(PROMPT_MODES).toEqual(["verbatim", "assisted"]);
  });

  /** 옛 작업에는 이 값이 없다. 없으면 지금까지의 동작이어야 한다. */
  it("기본은 다듬어서다", () => {
    const stored: PromptMode | undefined = undefined;
    expect(stored ?? "assisted").toBe("assisted");
  });
});
