import { describe, expect, it } from "vitest";
import { appendDecision } from "../library-append";

/**
 * **이미 붙은 장을 또 붙이지 않는다**(독립 리뷰 HIGH·MEDIUM).
 *
 * 화면은 어디까지 올렸는지를 켜져 있는 동안만 기억한다. 초안을 다시 열거나,
 * 응답이 오기 전에 연결이 끊겨 다시 누르면 같은 장을 또 보낸다. 서버가
 * 「이 작업에 몇 장 있나」로 판단해야 한 페이지에 같은 장이 두 벌 붙지 않는다.
 */
describe("어디에 붙일까", () => {
  it("자리를 안 알려 주면 지금까지처럼 뒤에 붙인다 — 리디자인이 이렇게 부른다", () => {
    expect(appendDecision({ existingCount: 3, count: 1 })).toEqual({ kind: "append", startPosition: 3 });
    expect(appendDecision({ existingCount: null, count: 1 })).toEqual({ kind: "create" });
  });

  it("처음이면 새로 만든다", () => {
    expect(appendDecision({ existingCount: null, startPosition: 0, count: 2 })).toEqual({ kind: "create" });
  });

  it("알려 준 자리가 지금 끝이면 거기에 붙인다", () => {
    expect(appendDecision({ existingCount: 4, startPosition: 4, count: 2 })).toEqual({ kind: "append", startPosition: 4 });
  });

  it("**이미 그 장들이 있으면 아무것도 안 하고 성공이라 한다** — 다시 보낸 것이다", () => {
    expect(appendDecision({ existingCount: 9, startPosition: 0, count: 9 })).toEqual({ kind: "already", imageCount: 9 });
    expect(appendDecision({ existingCount: 6, startPosition: 4, count: 2 })).toEqual({ kind: "already", imageCount: 6 });
  });

  it("**중간이 비었으면 거절하고 지금 몇 장인지 알려 준다** — 그 뒤부터 다시 보내면 된다", () => {
    expect(appendDecision({ existingCount: 2, startPosition: 4, count: 2 })).toEqual({ kind: "conflict", imageCount: 2 });
    expect(appendDecision({ existingCount: null, startPosition: 3, count: 1 })).toEqual({ kind: "conflict", imageCount: 0 });
  });

  it("일부만 겹쳐도 거절한다 — 겹친 장이 두 번 붙는다", () => {
    expect(appendDecision({ existingCount: 5, startPosition: 4, count: 3 })).toEqual({ kind: "conflict", imageCount: 5 });
  });
});
