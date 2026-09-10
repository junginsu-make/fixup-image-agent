import { describe, expect, it } from "vitest";
import { hasFinalConsonant, withJosa } from "../josa";

/**
 * 조사가 틀리면 **화면이 어색해지지 고장 나지는 않는다.** 그래서 아무도
 * 안 고치고, 안내 문구만 계속 어설프게 남는다.
 */

describe("받침 판정", () => {
  it("받침이 있는 글자", () => {
    expect(hasFinalConsonant("경제형")).toBe(true);
    expect(hasFinalConsonant("표준형")).toBe(true);
    expect(hasFinalConsonant("일관형")).toBe(true);
  });

  it("받침이 없는 글자", () => {
    expect(hasFinalConsonant("속도형 라이트")).toBe(false);
    expect(hasFinalConsonant("정밀형 플러스")).toBe(false);
    expect(hasFinalConsonant("나비")).toBe(false);
  });

  /** 영문·숫자로 끝나면 받침이 있는 쪽으로 본다 — 지금까지의 문장과 같게. */
  it("한글이 아니면 받침이 있는 쪽으로 본다", () => {
    expect(hasFinalConsonant("Model 2")).toBe(true);
    expect(hasFinalConsonant("")).toBe(true);
  });
});

describe("조사 붙이기", () => {
  it("받침에 따라 갈린다", () => {
    expect(withJosa("경제형", "은는")).toBe("경제형은");
    expect(withJosa("속도형 라이트", "은는")).toBe("속도형 라이트는");

    expect(withJosa("표준형", "으로로")).toBe("표준형으로");
    expect(withJosa("정밀형 플러스", "으로로")).toBe("정밀형 플러스로");
  });

  it("나머지 짝도 같은 규칙이다", () => {
    expect(withJosa("경제형", "이가")).toBe("경제형이");
    expect(withJosa("나비", "이가")).toBe("나비가");
    expect(withJosa("경제형", "을를")).toBe("경제형을");
    expect(withJosa("나비", "을를")).toBe("나비를");
    expect(withJosa("경제형", "과와")).toBe("경제형과");
    expect(withJosa("나비", "과와")).toBe("나비와");
  });
});
