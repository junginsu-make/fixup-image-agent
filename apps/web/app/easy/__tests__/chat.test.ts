import { describe, expect, it } from "vitest";
import { NOT_MADE_YET } from "../cardnews-after";
import { easyChatPrompt, readEasyDecision } from "../chat";
import type { EasyMessage } from "../turn";
import { askBody } from "../row-marks";

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

describe("상세페이지를 가른다 (설계 §2-7)", () => {
  it("detail_page 를 읽는다", () => {
    expect(readEasyDecision({ wants: "detail_page", reply: "", ratio: "", look: "" }).wants)
      .toBe("detail_page");
  });

  /** 상세페이지에 대해 **묻는 말**까지 안내로 끝내면 대화가 안 된다. */
  it("만들어 달라는 것과 묻는 말을 가르라고 알린다", () => {
    const prompt = easyChatPrompt([], "상세페이지 만들어줘");

    expect(prompt).toContain("detail_page");
    expect(prompt).toContain("상세페이지 문구 좀 봐줘");
  });
});

describe("카드뉴스 갈래 (2단계 설계 §4)", () => {
  it("cardnews 와 either 를 읽는다", () => {
    expect(readEasyDecision({ wants: "cardnews", reply: "", ratio: "", look: "" }).wants).toBe("cardnews");
    expect(readEasyDecision({ wants: "either", reply: "", ratio: "", look: "" }).wants).toBe("either");
  });

  it("원고가 있을 때만 revise 를 받는다", () => {
    expect(readEasyDecision({ wants: "revise", reply: "", ratio: "", look: "" }, { canRevise: true }).wants).toBe("revise");
    expect(readEasyDecision({ wants: "revise", reply: "", ratio: "", look: "" }).wants).toBe("talk");
  });

  it("한 장인지 여러 장인지 모르면 짐작하지 말라고 알린다", () => {
    const prompt = easyChatPrompt([], "신메뉴 홍보물 만들어줘");
    expect(prompt).toContain("either");
    expect(prompt).toContain("신메뉴 홍보물");
    expect(prompt).toContain("cardnews");
  });

  it("원고가 있는 대화에서만 revise 를 알려 준다", () => {
    expect(easyChatPrompt([], "더 짧게", 0, true)).toContain("revise");
    expect(easyChatPrompt([], "더 짧게")).not.toContain("revise");
  });

  /** 설계 §7 「만든 뒤에 고치기」의 예가 「더 밝게」다. 글만이 아니라 카드의 모습도 고친다. */
  it("원고가 있으면 카드 모습을 고치는 말도 revise 라고 알려 준다", () => {
    const prompt = easyChatPrompt([], "더 밝게", 0, true);
    expect(prompt).toContain("「더 밝게」");
    expect(prompt).toContain("모습");
    expect(easyChatPrompt([], "더 밝게")).not.toContain("「더 밝게」");
  });
});

describe("만든 카드뉴스 손보기 (3단계 §5)", () => {
  const 결정 = (over: Record<string, unknown>) => ({ wants: "talk", reply: "", ratio: "", look: "", card: 0, note: "", ...over });

  it("장 번호와 말을 읽는다, 번호가 없으면 비운다", () => {
    expect(readEasyDecision(결정({ wants: "card_redo", card: 3, note: " 글자 크게 " }), { canRevise: true, made: true }))
      .toMatchObject({ wants: "card_redo", card: 3, note: "글자 크게" });
    expect(readEasyDecision(결정({ wants: "card_text", card: 0, note: "" }), { canRevise: true })).not.toHaveProperty("card");
    expect(readEasyDecision(결정({ wants: "card_text", card: 2.5 }), { canRevise: true })).not.toHaveProperty("card");
  });

  it("원고가 없으면 장 고치기를 말로 받는다", () => {
    expect(readEasyDecision(결정({ wants: "card_text", card: 2 })).wants).toBe("talk");
  });

  /** Review Focus 4 */
  it("만든 카드가 없으면 다시 그리기 · 게시글 · 받기는 먼저 만들라고 답한다", () => {
    for (const wants of ["card_redo", "caption", "download"]) {
      expect(readEasyDecision(결정({ wants, card: 1 }), { canRevise: true, made: false }))
        .toMatchObject({ wants: "talk", reply: NOT_MADE_YET });
    }
  });

  it("카드뉴스가 아예 없으면 그 갈래들은 모델의 답 그대로 말로 받는다", () => {
    expect(readEasyDecision(결정({ wants: "download", reply: "무엇을 받으실까요?" })))
      .toMatchObject({ wants: "talk", reply: "무엇을 받으실까요?" });
  });

  it("원고가 있을 때만 장 고치기를, 만든 뒤에만 다시 그리기 · 게시글 · 받기를 알려 준다", () => {
    expect(easyChatPrompt([], "3번 더 짧게", 0, true)).toContain("card_text");
    expect(easyChatPrompt([], "3번 더 짧게", 0, true)).not.toContain("card_redo");
    expect(easyChatPrompt([], "3번 다시", 0, true, true)).toContain("card_redo");
    expect(easyChatPrompt([], "3번 다시", 0, true, true)).toContain("download");
    expect(easyChatPrompt([], "안녕")).not.toContain("card_text");
  });
});

describe("물음 뒤의 말 (2차 D1)", () => {
  const 물음뒤 = [말("user", "바다 포스터", "u1"), 말("assistant", askBody("ratio", "어떤 모양으로 만들까요?", { wants: "image" }), "q1")];

  it("마지막 줄이 물음이면 그 물음과 답 표시(note)를 알린다 — 표시 글자는 안 보낸다", () => {
    const prompt = easyChatPrompt(물음뒤, "세로로");
    expect(prompt).toContain("도우미가 바로 앞에서 「어떤 모양으로 만들까요?」라고 물었습니다");
    expect(prompt).toContain("`note` 에 `answer`");
    expect(prompt).not.toContain("ask:ratio");
  });

  it("물음 뒤에 다른 말이 이어졌으면 안 알린다", () => {
    const prompt = easyChatPrompt([...물음뒤, 말("user", "고마워", "u2"), 말("assistant", "네", "a1")], "고양이");
    expect(prompt).not.toContain("도우미가 바로 앞에서");
  });

  it("장 번호 갈래가 있으면 note 에 answer 대신 고칠 내용을 적으라고 한다", () => {
    expect(easyChatPrompt(물음뒤, "3번", 0, true, true, false)).toContain("card_text · card_redo 로 고르면 note 에는 answer 대신 고칠 내용");
    expect(easyChatPrompt(물음뒤, "3번")).not.toContain("card_text");
  });

  /** 2차 최종 리뷰 6 — 물음 갈래마다 답하는 법을 한 줄 준다. 같은 물음을 되풀이하지 않게. */
  it("물음 갈래마다 답하는 법을 알린다", () => {
    expect(easyChatPrompt(물음뒤, "그냥 해줘")).toContain("모양을 말하지 않은 답이면 ratio · look 을 비워 두세요. 같은 물음을 다시 하지 않습니다");
    const 갈래물음 = [말("user", "홍보물", "u1"), 말("assistant", askBody("kind", "한 장? 여러 장?", { ids: [] }), "q1")];
    expect(easyChatPrompt(갈래물음, "아무거나")).toContain("either 로 다시 묻지 마세요");
    const 번호물음 = [말("user", "고쳐줘", "u1"), 말("assistant", askBody("target", "몇 번?", { numbers: [1, 2] }), "q1")];
    expect(easyChatPrompt(번호물음, "1번", 0, false, false, true)).toContain("image_edit 로 고르고 target 에 그 번호");
  });
});
