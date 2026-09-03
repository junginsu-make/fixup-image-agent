import { describe, expect, it } from "vitest";
import { HOME_AFTER_LOGIN, safeNext } from "../routes";

describe("로그인 뒤 처음 열리는 곳", () => {
  it("라이브러리다", () => {
    // 만들기부터 열면 재료가 뭐가 있는지 모르는 채로 시작하게 된다.
    // 가진 것을 먼저 보고 거기서 도구로 보내는 흐름이 맞다.
    expect(HOME_AFTER_LOGIN).toBe("/library");
  });
});

describe("가려던 곳으로 돌려보내기", () => {
  it("원래 가려던 화면이 있으면 그리로", () => {
    expect(safeNext("/sns/abc")).toBe("/sns/abc");
  });

  it("없으면 라이브러리로", () => {
    expect(safeNext(null)).toBe("/library");
    expect(safeNext("")).toBe("/library");
  });

  it("바깥 주소로는 보내지 않는다", () => {
    // //evil.example.com 은 브라우저가 다른 사이트로 읽는다.
    expect(safeNext("//evil.example.com")).toBe("/library");
    expect(safeNext("https://evil.example.com")).toBe("/library");
    expect(safeNext("evil.example.com")).toBe("/library");
  });
});
