import { describe, expect, it } from "vitest";
import {
  CHAT_MIN,
  HANDLE,
  LIST_DEFAULT,
  LIST_MAX,
  LIST_MIN,
  RESULT_DEFAULT,
  RESULT_MAX,
  RESULT_MIN,
  clampListWidth,
  clampResultWidth,
  readListWidth,
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
    const 좁은화면 = CHAT_MIN + HANDLE + RESULT_MIN + 40;

    expect(clampResultWidth(좁은화면, 9999)).toBe(좁은화면 - CHAT_MIN - HANDLE);
    // **구분선 몫까지 센다.** 안 빼면 선 너비만큼 대화가 바닥 아래로 눌린다.
    expect(clampResultWidth(좁은화면, 9999) + CHAT_MIN + HANDLE).toBeLessThanOrEqual(좁은화면);
  });

  /** 둘 다 못 넣는 너비면 결과 칸을 접는다. 화면이 그것을 안 그린다. */
  it("둘 다 못 넣으면 0 을 준다", () => {
    expect(clampResultWidth(CHAT_MIN + HANDLE + 10, 300)).toBe(0);
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

/**
 * 대화 목록 칸 (2026-09-21 사용자 — 「채팅목록 사이즈 더 넓혀주세요. 그리고
 * 여기도 마우스로 클릭시 선 이동 될 수 있게 하세요」).
 */
describe("목록을 끌어 놓은 자리", () => {
  it("가운데면 그대로 쓴다", () => {
    expect(clampListWidth(WIDE, 320)).toBe(320);
  });

  it("너무 좁게 끌면 최소에서 멈춘다", () => {
    expect(clampListWidth(WIDE, 50)).toBe(LIST_MIN);
    expect(clampListWidth(WIDE, -100)).toBe(LIST_MIN);
  });

  it("너무 넓게 끌면 최대에서 멈춘다", () => {
    expect(clampListWidth(4000, 3000)).toBe(LIST_MAX);
  });

  /** **대화 바닥은 여기서도 지킨다.** 목록이 화면을 다 먹으면 글을 못 친다. */
  it("대화 쪽에 최소 너비를 남긴다", () => {
    const 좁은화면 = LIST_MIN + HANDLE + CHAT_MIN + 40;

    expect(clampListWidth(좁은화면, 9999)).toBe(좁은화면 - CHAT_MIN - HANDLE);
    expect(clampListWidth(좁은화면, 9999) + CHAT_MIN + HANDLE).toBeLessThanOrEqual(좁은화면);
  });

  /**
   * **목록은 접지 않는다.** 결과 칸은 자리가 없으면 0 이 되어 사라지지만,
   * 목록이 사라지면 대화를 갈아탈 길이 없어진다. 좁은 화면에서는 애초에 떠
   * 있는 판이라 이 셈에 끼지도 않는다.
   */
  it("자리가 없어도 0 이 되지 않는다", () => {
    expect(clampListWidth(CHAT_MIN + HANDLE + 10, 300)).toBe(LIST_MIN);
    expect(clampListWidth(200, 300)).toBe(LIST_MIN);
    expect(clampListWidth(0, 300)).toBe(LIST_MIN);
  });

  it("정수로 준다", () => {
    expect(Number.isInteger(clampListWidth(WIDE, 320.7))).toBe(true);
  });
});

describe("저장해 둔 목록 너비", () => {
  it("없거나 망가졌으면 기본으로", () => {
    expect(readListWidth(null)).toBe(LIST_DEFAULT);
    expect(readListWidth("")).toBe(LIST_DEFAULT);
    expect(readListWidth("넓게")).toBe(LIST_DEFAULT);
    expect(readListWidth("-50")).toBe(LIST_DEFAULT);
  });

  it("숫자면 그것을 쓴다", () => {
    expect(readListWidth("320")).toBe(320);
  });
});
