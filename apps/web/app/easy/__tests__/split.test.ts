import { describe, expect, it } from "vitest";
import {
  CHAT_MIN,
  RESULT_DEFAULT,
  RESULT_MAX,
  RESULT_MIN,
  clampResultWidth,
  readResultWidth,
} from "../split";

/**
 * 대화와 결과 칸 사이 **구분선**의 자리 (2026-09-18 사용자 요청).
 *
 * **끝까지 끌면 못 돌아온다.** 결과 칸이 0 이 되면 구분선도 사라져 다시 넓힐
 * 손잡이가 없고, 대화 쪽이 0 이 되면 입력창이 눌려 글을 못 친다.
 */

const WIDE = 1200;

describe("끌어 놓은 자리", () => {
  it("가운데면 그대로 쓴다", () => {
    expect(clampResultWidth(WIDE, 400)).toBe(400);
  });

  it("너무 좁게 끌면 최소에서 멈춘다", () => {
    expect(clampResultWidth(WIDE, 50)).toBe(RESULT_MIN);
    expect(clampResultWidth(WIDE, 0)).toBe(RESULT_MIN);
    expect(clampResultWidth(WIDE, -100)).toBe(RESULT_MIN);
  });

  it("너무 넓게 끌면 최대에서 멈춘다", () => {
    expect(clampResultWidth(4000, 3000)).toBe(RESULT_MAX);
  });

  /**
   * **대화 쪽 바닥이 먼저다.** 화면이 좁을 때 결과 칸을 우선하면 입력창이
   * 눌리고, 글을 못 치면 이 모드가 아무것도 못 하는 화면이 된다.
   */
  it("대화 쪽에 최소 너비를 남긴다", () => {
    const 좁은화면 = CHAT_MIN + RESULT_MIN + 40;

    expect(clampResultWidth(좁은화면, 9999)).toBe(좁은화면 - CHAT_MIN);
    expect(clampResultWidth(좁은화면, 9999) + CHAT_MIN).toBeLessThanOrEqual(좁은화면);
  });

  /** 둘 다 못 넣는 너비면 결과 칸을 접는다. 화면이 그것을 안 그린다. */
  it("둘 다 못 넣으면 0 을 준다", () => {
    expect(clampResultWidth(CHAT_MIN + 10, 300)).toBe(0);
    expect(clampResultWidth(200, 300)).toBe(0);
  });

  it("정수로 준다", () => {
    expect(Number.isInteger(clampResultWidth(WIDE, 400.7))).toBe(true);
  });
});

describe("저장해 둔 값", () => {
  /**
   * **브라우저에만 남는다.** 이 사람 이 브라우저의 편의일 뿐이고, 비거나
   * 망가져도 화면이 제대로 떠야 한다.
   */
  it("없으면 기본으로", () => {
    expect(readResultWidth(null)).toBe(RESULT_DEFAULT);
    expect(readResultWidth("")).toBe(RESULT_DEFAULT);
  });

  it("숫자가 아니면 기본으로", () => {
    expect(readResultWidth("넓게")).toBe(RESULT_DEFAULT);
    expect(readResultWidth("NaN")).toBe(RESULT_DEFAULT);
    expect(readResultWidth("-50")).toBe(RESULT_DEFAULT);
  });

  it("숫자면 그것을 쓴다", () => {
    expect(readResultWidth("480")).toBe(480);
  });

  /**
   * **읽은 값도 가둔다.** 저장해 둔 뒤 창을 줄이면 그 값이 지금 화면에 안
   * 맞는다. 읽기는 숫자만 보고, 가두는 것은 `clampResultWidth` 가 한다.
   */
  it("읽은 값은 다시 가둬야 쓸 수 있다", () => {
    const 저장값 = readResultWidth("900");

    expect(clampResultWidth(800, 저장값)).toBeLessThan(저장값);
  });
});
