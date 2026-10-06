import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EASY_DEFAULT_RATIO, easyAsk } from "../ask";
import { askSubmission, carryChoices } from "../turn-carry";

/**
 * **대화가 끊기던 두 자리**(2026-10-06 설계 B1 · B2).
 *
 * B1 아무것도 안 고르고 「이대로 만들기」를 누르면 빈 값을 빼고 보내서, 서버는 「안
 *    골랐다」로 보고 또 물었다 — 같은 물음이 끝없이 떴다.
 * B2 비율에 답한 뒤 갈래 물음이 뜨고 갈래 단추를 누르면, 앞서 고른 비율이 안 실려
 *    비율을 또 물었다(핑퐁).
 */
describe("「이대로 만들기」 (B1)", () => {
  it("아무것도 안 골랐으면 기본 비율을 고른 값으로 싣는다", () => {
    expect(askSubmission("고양이 그려줘", { ratio: "", look: "" }))
      .toEqual({ prompt: "고양이 그려줘", ratio: EASY_DEFAULT_RATIO });
  });

  it("그러면 서버가 또 묻지 않는다", () => {
    const 보낸것 = askSubmission("고양이 그려줘", { ratio: "", look: "" });
    expect(easyAsk({ attachmentCount: 0, chosenRatio: 보낸것.ratio, chosenLook: 보낸것.look }).asks).toBe(false);
  });

  it("고른 것이 있으면 그대로, 그림체만 골랐어도 비율은 기본값", () => {
    expect(askSubmission("x", { ratio: "9:16", look: "look-a" })).toEqual({ prompt: "x", ratio: "9:16", look: "look-a" });
    expect(askSubmission("x", { ratio: "", look: "look-a" })).toEqual({ prompt: "x", ratio: EASY_DEFAULT_RATIO, look: "look-a" });
  });
});

describe("물음에 답할 때 앞서 고른 것을 함께 (B2)", () => {
  it("비율을 고른 뒤 갈래 단추로 다시 보내면 그 비율을 싣는다", () => {
    const 첫답 = carryChoices({ continuing: true, carry: {}, picked: { ratio: "4:5" } });
    expect(carryChoices({ continuing: true, carry: 첫답, picked: {} })).toEqual({ ratio: "4:5" });
  });

  it("새로 고른 값이 앞의 값을 이긴다", () => {
    expect(carryChoices({ continuing: true, carry: { ratio: "4:5", look: "a" }, picked: { ratio: "9:16" } }))
      .toEqual({ ratio: "9:16", look: "a" });
  });

  /** Review Focus 5 */
  it("새로 친 말이면 앞서 고른 것을 버린다 — 다른 주문에 옛 비율이 몰래 붙지 않는다", () => {
    expect(carryChoices({ continuing: false, carry: { ratio: "4:5", look: "a" }, picked: { ratio: "9:16" } })).toEqual({});
  });

  it("빈 값은 싣지 않는다", () => {
    expect(carryChoices({ continuing: true, carry: {}, picked: { ratio: "", look: "" } })).toEqual({});
  });
});

/**
 * **단추로 고른 갈래는 이어 답할 때도 고른 것이다**(설계 A2, 최종 리뷰 I1). 「이미지 한 장」
 * 단추 뒤 비율 · 사진 물음에 단추로 답해 다시 보내면 그 말에는 갈래가 없다. 「골랐다」를
 * 안 이으면 서버가 또 판단해 다른 길로 샜다.
 */
describe("단추로 고른 갈래를 잇는다 (A2)", () => {
  const 갈래단추 = () => carryChoices({ continuing: true, carry: {}, picked: { kind: "image" } });

  it("갈래 단추로 보낸 턴은 고른 것이다", () => {
    expect(갈래단추().kindPicked).toBe(true);
  });

  it("그 뒤 비율 물음에 「이대로 만들기」로 답하면 「골랐다」를 싣는다", () => {
    const 답 = askSubmission("고양이 그려줘", { ratio: "", look: "" });
    expect(carryChoices({ continuing: true, carry: 갈래단추(), picked: 답 })).toEqual({ ratio: EASY_DEFAULT_RATIO, kindPicked: true });
  });

  it("사진 물음에 단추로 답해도 싣는다", () => {
    expect(carryChoices({ continuing: true, carry: 갈래단추(), picked: {} }).kindPicked).toBe(true);
  });

  it("말로 친 답은 고른 것이 아니다", () => {
    expect(carryChoices({ continuing: true, carry: 갈래단추() }).kindPicked).toBeUndefined();
  });

  it("새로 친 말이면 버린다", () => {
    expect(carryChoices({ continuing: false, carry: 갈래단추(), picked: { kind: "image" } })).toEqual({});
  });

  it("갈래를 안 고른 채 이어 답하면 싣지 않는다", () => {
    expect(carryChoices({ continuing: true, carry: { ratio: "4:5" }, picked: {} }).kindPicked).toBeUndefined();
  });
});

describe("화면이 묶음을 쓴다", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  it("「이대로 만들기」는 askSubmission 으로 보낸다", () => {
    expect(화면).toContain("send(askSubmission(보낼말, { ratio: askRatio, look: askLook }))");
  });

  it("보낼 때 고른 값 묶음을 싣는다", () => {
    expect(화면).toContain("carryChoices({ continuing: 이어감, carry: carried.current, picked: 다시 })");
    expect(화면).toContain("...(고른값.ratio ? { ratio: 고른값.ratio } : {})");
    expect(화면).not.toContain("...(다시?.ratio ? { ratio: 다시.ratio } : {})");
  });
});
