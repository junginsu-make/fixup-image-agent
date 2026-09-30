import { describe, expect, it } from "vitest";
import { photoAnswer, photoAskReady, pickPhoto, startPhotoAsk } from "../photo-ask-state";

/**
 * **물음 화면의 상태**(설계 §2-5). 화면 안에 두면 값으로 못 잰다.
 *
 * 가장 쉽게 깨지는 것: 판단이 「인물 그대로 · 그림체만」으로 정한 줄이 다시
 * 보낼 때 「인물 그대로」로 바뀌는 것 — 그 문구는 그림체 바꾸기를 금지한다.
 */

const 줄 = [
  { id: "a", role: "preserve_person_restyled" as const },
  { id: "b", role: "unclear" as const },
];

describe("물음 시작", () => {
  it("판단이 정한 줄은 고른 채로, 모르는 줄은 빈 채로 연다", () => {
    const state = startPhotoAsk("카페 포스터", "unclear", 줄);

    expect(state.picked).toEqual({ a: "preserve_person_restyled" });
    expect(state.touched).toEqual([]);
  });
});

describe("고르기", () => {
  it("다른 줄에 답해도 그림체만 줄은 그대로 남는다", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "style");

    expect(state.picked).toEqual({ a: "preserve_person_restyled", b: "style" });
  });

  it("그 줄에서 다른 단추를 누르면 바뀐다", () => {
    expect(pickPhoto(startPhotoAsk("x", "unclear", 줄), "a", "style").picked.a).toBe("style");
  });

  it("원래 상태를 바꾸지 않는다", () => {
    const before = startPhotoAsk("x", "unclear", 줄);
    pickPhoto(before, "b", "style");
    expect(before.picked).toEqual({ a: "preserve_person_restyled" });
  });
});

describe("다 골랐나", () => {
  it("모르는 줄이 남으면 아직이다", () => {
    expect(photoAskReady(startPhotoAsk("x", "unclear", 줄))).toBe(false);
  });

  it("인물이 두 줄이면 아직이다", () => {
    const state = startPhotoAsk("x", "people", [
      { id: "a", role: "preserve_person" }, { id: "b", role: "preserve_person" },
    ]);
    expect(photoAskReady(state)).toBe(false);
    expect(photoAskReady(pickPhoto(state, "b", "style"))).toBe(true);
  });
});

describe("답하기", () => {
  it("단추로 답하면 처음 말과 모든 줄의 고른 값을 보낸다 — 그림체만 줄도", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "style");

    expect(photoAnswer(state)).toEqual({
      prompt: "카페 포스터",
      photoRoles: [{ id: "a", role: "preserve_person_restyled" }, { id: "b", role: "style" }],
    });
  });

  /** Review Focus 5 */
  it("말로 답하면 처음 말과 답을 잇고, 직접 누른 줄만 보낸다", () => {
    const state = pickPhoto(startPhotoAsk("카페 포스터", "unclear", 줄), "b", "preserve_product");

    expect(photoAnswer(state, "  2번은 우리 원두 봉투야 ")).toEqual({
      prompt: "카페 포스터\n2번은 우리 원두 봉투야",
      photoRoles: [{ id: "b", role: "preserve_product" }],
    });
  });
});
