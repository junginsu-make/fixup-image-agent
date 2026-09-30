import { describe, expect, it } from "vitest";
import { photoAnswer, photoAskReady, pickPhoto, previousRolesFor, rememberRoles, startPhotoAsk } from "../photo-ask-state";

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

/**
 * **지난 역할을 들고 있다가 보낸다**(설계 §2-4 차례 3). 이어 만들 때 같은
 * 물음이 또 뜨지 않게 한다. 대화 표에는 안 남는다.
 */
describe("지난 역할", () => {
  it("만든 뒤 받은 역할을 사진 id 별로 기억한다 — 원래 것을 바꾸지 않는다", () => {
    const before = { a: "style" as const };
    const after = rememberRoles(before, [{ id: "b", role: "preserve_product" }]);

    expect(after).toEqual({ a: "style", b: "preserve_product" });
    expect(before).toEqual({ a: "style" });
  });

  it("같은 사진은 새 역할로 바뀐다", () => {
    expect(rememberRoles({ a: "style" }, [{ id: "a", role: "preserve_person" }])).toEqual({ a: "preserve_person" });
  });

  it("모르는 역할이나 모양이 틀린 것은 기억하지 않는다", () => {
    expect(rememberRoles({}, [{ id: "a", role: "unclear" }, { id: 3, role: "style" }, "엉망"])).toEqual({});
    expect(rememberRoles({ a: "style" }, undefined)).toEqual({ a: "style" });
  });

  it("지금 붙은 사진 중 기억한 것만 보낸다", () => {
    expect(previousRolesFor({ a: "style", z: "preserve_product" }, ["a", "b"]))
      .toEqual([{ id: "a", role: "style" }]);
  });

  it("이번에 단추로 고른 사진은 지난 역할로 보내지 않는다", () => {
    expect(previousRolesFor({ a: "style" }, ["a"], [{ id: "a", role: "preserve_product" }])).toEqual([]);
  });
});
