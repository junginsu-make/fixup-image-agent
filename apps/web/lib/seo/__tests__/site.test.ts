import { describe, expect, it } from "vitest";
import { verificationMetadata } from "../site";

/** 소유 확인 값(계획 2026-10-06 seo-search-registration). 비면 태그를 안 만든다. */
describe("verificationMetadata", () => {
  it("둘 다 비면 아무것도 내지 않는다", () => {
    expect(verificationMetadata({ google: "", naver: "", daumPin: "" })).toBeUndefined();
  });
  it("구글만", () => {
    expect(verificationMetadata({ google: "g-code", naver: "", daumPin: "" })).toEqual({ google: "g-code" });
  });
  it("네이버는 naver-site-verification 이름으로", () => {
    expect(verificationMetadata({ google: "", naver: "n-code", daumPin: "" })).toEqual({
      other: { "naver-site-verification": "n-code" },
    });
  });
  it("둘 다, 앞뒤 공백은 지운다", () => {
    expect(verificationMetadata({ google: " g ", naver: " n ", daumPin: "" })).toEqual({
      google: "g",
      other: { "naver-site-verification": "n" },
    });
  });
});
