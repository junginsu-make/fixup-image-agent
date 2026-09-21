import { describe, expect, it } from "vitest";
import { easyChatPrompt, readEasyDecision } from "../chat";
import type { EasyMessage } from "../turn";

/**
 * **말인가, 만들어 달라는 것인가** (2026-09-21 사용자).
 *
 * 그전에는 친 말이 전부 그림 주문이었다. 「안녕하세요」도 그림을 만들었다 —
 * 값이 나가고, 엉뚱한 그림이 나오고, 물어본 것에는 아무도 답하지 않았다.
 *
 * 가르는 일은 모델이 한다. 여기서 재는 것은 **무엇을 물었나**와 **돌아온 답을
 * 어떻게 읽나**다.
 */

const 말 = (role: EasyMessage["role"], body: string, id = `${role}-${body}`): EasyMessage =>
  ({ id, role, body });

describe("모델에게 보낼 글", () => {
  it("마지막 말을 싣는다", () => {
    expect(easyChatPrompt([], "해 질 녘 바닷가")).toContain("해 질 녘 바닷가");
  });

  /**
   * **지난 대화가 있어야 「그거 말고」가 뜻이 선다.** 없으면 모델이 매번 처음
   * 만난 사람처럼 군다.
   */
  it("지난 대화를 함께 싣는다", () => {
    const prompt = easyChatPrompt([말("user", "카페 포스터"), 말("assistant", "어떤 결로 할까요?")], "따뜻하게");

    expect(prompt).toContain("카페 포스터");
    expect(prompt).toContain("어떤 결로 할까요?");
    expect(prompt).toContain("따뜻하게");
  });

  /** **우리가 넣은 인사는 대화가 아니다.** 실어 보내면 모델이 그것에 답한다. */
  it("인사는 빼고 싣는다", () => {
    const 인사 = 말("system", "이미지를 붙이시겠어요? 없어도 만들 수 있습니다.", "greeting");

    expect(easyChatPrompt([인사], "안녕")).not.toContain("붙이시겠어요");
  });

  /**
   * **그림 줄에는 본문이 없다.** 빈 글로 실으면 모델이 그 자리를 빈 말로 읽는다.
   * 무엇이 일어났는지 대신 적어 준다.
   */
  it("그림 줄은 무슨 일이 있었는지로 적는다", () => {
    const prompt = easyChatPrompt([말("image", "")], "왜 그렇게 나왔어?");

    expect(prompt).toContain("이미지 한 장을 만들어 보여 줬습니다");
  });

  /** 대화가 길어져도 보내는 글이 끝없이 늘지 않는다. */
  it("지난 대화를 끝에서부터 잘라 싣는다", () => {
    const 긴대화 = Array.from({ length: 40 }, (_, at) => 말("user", `줄${at}`));
    const prompt = easyChatPrompt(긴대화, "마지막");

    expect(prompt).toContain("줄39");
    expect(prompt).not.toContain("줄0\n");
  });

  /**
   * **「이걸로」가 무엇인지 알려 줘야 뜻이 선다**(2026-09-21 실측).
   *
   * 안 알려 줬더니 「이걸로 하나 그려줘」를 `talk` 로 읽고 되물었다. 모델이
   * 틀린 것이 아니다 — 가리키는 것이 무엇인지 말해 주지 않았다.
   */
  it("붙인 것이 있으면 그 사실을 적는다", () => {
    const 붙였을때 = easyChatPrompt([], "이걸로 하나 그려줘", 2);

    expect(붙였을때).toContain("이미지 2장을 붙여 두었습니다");
    expect(붙였을때).toContain("되묻지 마세요");
  });

  it("붙인 것이 없으면 그 말을 안 적는다", () => {
    expect(easyChatPrompt([], "이걸로 하나 그려줘")).not.toContain("붙여 두었습니다");
  });

  /**
   * **낱말로 가르지 말라고 못 박는다.** 「방금 그린 거 왜 그렇게 나왔어?」에도
   * 「그린」이 있다. 그 함정을 프롬프트가 직접 말해야 모델이 안 빠진다.
   */
  it("낱말로 가르지 말라고 적는다", () => {
    const prompt = easyChatPrompt([], "아무거나");

    expect(prompt).toContain("낱말로 가르지 마세요");
    expect(prompt).toContain("지금 한 장 만들어 내놓기를 바라는지");
  });
});

describe("돌아온 답 읽기", () => {
  it("주문이면 image", () => {
    expect(readEasyDecision({ wants: "image", reply: "" }).wants).toBe("image");
  });

  it("말이면 답을 같이 준다", () => {
    expect(readEasyDecision({ wants: "talk", reply: " 안녕하세요 " })).toEqual({
      wants: "talk",
      reply: "안녕하세요",
    });
  });

  /**
   * **모르는 것이 오면 시끄럽게 실패한다.**
   *
   * 「모르겠으면 그림」으로 떨어뜨리면 인사 한 마디에 값이 나가고, 「모르겠으면
   * 말」로 떨어뜨리면 주문이 조용히 씹힌다. 둘 다 사용자가 원인을 알 수 없다.
   */
  it("모르는 갈래는 받지 않는다", () => {
    expect(() => readEasyDecision({ wants: "picture", reply: "" })).toThrow();
    expect(() => readEasyDecision({ reply: "" })).toThrow();
    expect(() => readEasyDecision(null)).toThrow();
    expect(() => readEasyDecision("image")).toThrow();
  });

  it("답이 없어도 갈래는 산다", () => {
    expect(readEasyDecision({ wants: "talk" })).toEqual({ wants: "talk", reply: "" });
  });
});
