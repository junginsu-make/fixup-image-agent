import { describe, expect, it } from "vitest";
import { viewerSourceOf } from "../viewer-source";

/**
 * 확대할 때 어느 그림을 여는가.
 *
 * 목록이 작은 사본을 거는 자리가 생기면서, 같은 `img` 태그에 확대가 달려 있으면
 * **사본을 확대하게 된다.** 인쇄 비율(2400px)을 1024px 로 깎아 보여 주는 데
 * 그치지 않고, 뷰어의 "원본 크기" 표시까지 거짓말이 된다.
 */
describe("viewerSourceOf", () => {
  it("원본 주소를 따로 달아 두었으면 그것을 연다", () => {
    expect(viewerSourceOf({ viewerSrc: "/f", currentSrc: "/f?size=thumb", src: "/f?size=thumb" }))
      .toBe("/f");
  });

  it("안 달아 두었으면 예전처럼 보이는 그림을 연다", () => {
    expect(viewerSourceOf({ currentSrc: "/a.png", src: "/a.png" })).toBe("/a.png");
  });

  it("아무것도 없으면 빈 값이다", () => {
    expect(viewerSourceOf({})).toBe("");
  });
});
