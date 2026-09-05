import { describe, expect, it } from "vitest";
import { coverOf } from "../works-cover";

/**
 * 라이브러리 「작업물」 탭의 표지.
 *
 * 이 화면이 라이브러리를 열면 처음 보이는 자리다. 여기가 원본을 받으면
 * 목록 한 번에 수십 MB 가 오간다 — 미리보기를 만들어 둔 이유가 바로 이것이다.
 */
describe("coverOf", () => {
  it("카드뉴스 표지는 사본을 쓴다", () => {
    expect(coverOf({ assetUrl: "signed:orig", thumbUrl: "signed:thumb" })).toBe("signed:thumb");
  });

  it("포스터 표지도 사본을 쓴다", () => {
    expect(coverOf({ url: "signed:orig", thumbUrl: "signed:thumb" })).toBe("signed:thumb");
  });

  it("사본이 없는 옛 작업물은 원본으로 떨어진다", () => {
    expect(coverOf({ url: "signed:orig" })).toBe("signed:orig");
    expect(coverOf({ assetUrl: "signed:orig", thumbUrl: null })).toBe("signed:orig");
  });

  it("그림이 아직 없으면 비어 있다", () => {
    expect(coverOf(undefined)).toBeNull();
    expect(coverOf({})).toBeNull();
  });
});
