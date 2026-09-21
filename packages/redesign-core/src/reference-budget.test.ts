import { describe, expect, it } from "vitest";
import { referenceBudgetNotice } from "./reference-budget";

/**
 * **안 쓰인 참조를 말한다**(N-9, 설계 §6.2·§1 불변조건 7).
 *
 * 리디자인은 참조를 상한에서 자른다. 그 자체는 맞다 — 모델이 받을 수 있는
 * 장수가 정해져 있다. **문제는 안 알리는 것이다.**
 *
 * 사용자가 각도를 넷 고르고 원본이 세 장이면 각도 하나가 말없이 빠진다.
 * 결과가 왜 다른지 알 길이 없다.
 *
 * 설계 §1 불변 조건 7: 「**참조를 조용히 버리거나**, 검사하지 못한 결과를
 * 통과로 표시하지 않는다」.
 */

describe("다 쓴 경우에는 아무 말도 안 한다", () => {
  it("**전부 붙었으면 조용하다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 1, attachedCharacterCount: 1, originalCount: 2, attachedCount: 3,
    });

    expect(말).toBe("");
  });

  it("**인물을 안 골랐고 원본도 다 붙었으면 조용하다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 0, attachedCharacterCount: 0, originalCount: 4, attachedCount: 4,
    });

    expect(말).toBe("");
  });
});

describe("빠진 것이 있으면 말한다", () => {
  /**
   * **원본이 있으면 인물 자리가 줄어든다**(`characterSlots`). 각도를 넷
   * 골라도 원본이 세 장이면 한 장만 붙는다.
   */
  it("**인물 각도가 덜 붙었으면 몇 장인지 말한다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 4, attachedCharacterCount: 1, originalCount: 3, attachedCount: 4,
    });

    expect(말).toContain("4장");
    expect(말).toContain("1장");
  });

  it("**원본이 덜 붙었으면 몇 장인지 말한다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 0, attachedCharacterCount: 0, originalCount: 7, attachedCount: 4,
    });

    expect(말).toContain("7장");
    expect(말).toContain("4장");
  });

  it("**둘 다 덜 붙었으면 둘 다 말한다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 3, attachedCharacterCount: 1, originalCount: 6, attachedCount: 4,
    });

    expect(말).toContain("인물");
    expect(말).toContain("원본");
  });

  it("**왜 그런지 말한다** — 까닭 없이 「안 썼습니다」만 하면 고장으로 읽힌다", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 4, attachedCharacterCount: 1, originalCount: 3, attachedCount: 4,
    });

    expect(말).toContain("정해져 있어");
  });

  it("**줄표를 안 쓴다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 4, attachedCharacterCount: 1, originalCount: 3, attachedCount: 4,
    });

    expect(말).not.toContain("—");
  });
});

describe("모양이 아닌 값이 와도", () => {
  /**
   * **셈이 어긋나도 헛말을 하지 않는다.**
   *
   * 붙은 것이 고른 것보다 많다는 값이 오면 「빠진 것이 없다」로 봐야 한다.
   * `Math.max(0, …)` 를 빼면 음수가 0 이 아니게 되어 **아무것도 안 빠졌는데
   * 「덜 썼습니다」**가 뜬다.
   */
  it("**붙은 것이 더 많다고 와도 조용하다**", () => {
    const 말 = referenceBudgetNotice({
      characterCount: 1, attachedCharacterCount: 3, originalCount: 1, attachedCount: 4,
    });

    expect(말).toBe("");
  });

  it("**아무것도 없으면 조용하다**", () => {
    expect(
      referenceBudgetNotice({ characterCount: 0, attachedCharacterCount: 0, originalCount: 0, attachedCount: 0 }),
    ).toBe("");
  });
});
