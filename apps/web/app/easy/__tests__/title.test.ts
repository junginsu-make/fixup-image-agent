import { describe, expect, it } from "vitest";
import { easyTitle } from "../title";

/**
 * 대화 제목 (설계 §4-1). **LLM 을 한 번 더 부르지 않는다** — 값이 들고, 제목
 * 때문에 기다리게 된다.
 */

describe("대화 제목", () => {
  it("짧으면 그대로 쓴다", () => {
    expect(easyTitle("힙한 화보")).toBe("힙한 화보");
  });

  it("길면 자르고 말줄임표를 붙인다", () => {
    const title = easyTitle("해 질 녘 바닷가에서 필름 카메라를 든 사람의 뒷모습");

    expect(title).toBe("해 질 녘 바닷가에서 필름 카메라를…");
    expect(title.length).toBeLessThanOrEqual(21);
  });

  /**
   * **자른 끝의 공백을 뗀다.** 「카메라를 …」처럼 공백과 말줄임표가 붙으면
   * 말이 끊긴 것이 아니라 빠뜨린 것처럼 보인다.
   */
  it("자른 자리가 공백이면 떼고 붙인다", () => {
    // 스무 번째 글자가 공백인 말이다.
    expect(easyTitle("해 질 녘 바닷가에서 필름 카메라를 든")).not.toContain(" …");
  });

  /**
   * **줄바꿈이 제목에 들어가면 레일 한 줄이 무너진다.** 여러 줄을 친 경우다.
   */
  it("줄바꿈과 겹친 공백을 한 칸으로 만든다", () => {
    expect(easyTitle("힙한\n\n  화보  ")).toBe("힙한 화보");
  });

  /**
   * **빈 제목을 코드가 지어내지 않는다.**
   *
   * 「제목 없음」 같은 글을 여기서 만들면 그것이 표에 저장되고, 나중에 화면이
   * 바뀌어도 옛 글이 남는다. 빈 제목을 어떻게 보일지는 화면이 정한다.
   */
  it("빈 말이면 빈 제목이다", () => {
    expect(easyTitle("")).toBe("");
    expect(easyTitle("   \n  ")).toBe("");
  });
});
