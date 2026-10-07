import { describe, expect, it } from "vitest";
import { NOT_MADE_YET } from "../cardnews-after";
import { easyChatPrompt, readEasyDecision } from "../chat";
import type { EasyMessage } from "../turn";
import { askBody, sayBody } from "../row-marks";

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

describe("쓴 사진은 내려간다 (2차 D3)", () => {
  it("만든 것이 있고 붙은 사진이 없으면, 앞의 사진을 다시 쓰자는 말에 다시 붙여 달라고 하게 한다", () => {
    const prompt = easyChatPrompt([말("user", "카페 포스터"), 말("image", "")], "같은 사진으로 하나 더");
    expect(prompt).toContain("그 사진을 다시 붙여 주세요");
  });

  it("사진이 붙어 있거나 아직 만든 것이 없으면 안 적는다", () => {
    expect(easyChatPrompt([말("user", "카페 포스터"), 말("image", "")], "하나 더", 1)).not.toContain("다시 붙여 주세요");
    expect(easyChatPrompt([], "하나 더")).not.toContain("다시 붙여 주세요");
  });
});

describe("이 대화의 결과물 목록 (2차 D2)", () => {
  const 목록 = [
    { n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "카페 포스터" },
    { n: 2, rowId: "c1", workId: "card-1", kind: "cardnews" as const, state: "done" as const, words: "건강 카드뉴스" },
    { n: 3, rowId: "i2", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image" as const, state: "making" as const, words: "배경만 파랗게" },
    { n: 4, rowId: "i3", workId: "gone", kind: "deleted" as const, state: "deleted" as const, words: "배너" },
    { n: 5, rowId: "i4", workId: "p9", kind: "unknown" as const, state: "unknown" as const, words: "로고" },
  ];

  it("번호 · 갈래 · 만든 말 · 상태 · 고친 관계를 따로 싣고, 지난 대화의 결과물 줄에도 번호를 적는다", () => {
    const prompt = easyChatPrompt([말("image", "", "i1"), 말("image", "", "c1")], "아까 거", 0, false, false, true, { images: 목록 });
    expect(prompt).toContain("── 이 대화의 결과물");
    expect(prompt).toContain("#1 이미지 · 「카페 포스터」 · 완료");
    expect(prompt).toContain("#2 카드뉴스 · 「건강 카드뉴스」");
    expect(prompt).toContain("#3 이미지 · 「배경만 파랗게」 · 만드는 중 · #1 을 고친 것");
    expect(prompt).toContain("#4 (지운 결과) · 「배너」");
    // 리뷰 1차 수정 2: 못 읽은 것은 지운 것으로 말하지 않는다.
    expect(prompt).toContain("#5 (확인 못 함) · 「로고」");
    expect(prompt).not.toContain("#5 (지운 결과)");
    expect(prompt).toContain("(#1 이미지를 만들어 보여 줬습니다)");
    expect(prompt).toContain("(#2 카드뉴스를 만들어 보여 줬습니다)");
  });

  it("결과물이 없으면 목록을 안 싣는다", () => {
    expect(easyChatPrompt([], "안녕")).not.toContain("── 이 대화의 결과물");
  });
});

describe("AI 가 늘 말한다 (2차 D4)", () => {
  it("모든 갈래에서 reply 를 쓰게 하고, 일하는 갈래는 하는 중으로 말하게 한다", () => {
    const prompt = easyChatPrompt([], "카페 포스터 만들어줘");
    expect(prompt).toContain("모든 갈래에서 `reply` 에");
    // talk 은 세 문장까지, 그 밖은 1~2문장(Task 9 리뷰 Minor — 두 줄이 서로 어긋나지 않게).
    expect(prompt).toContain("talk 은 세 문장까지, 그 밖의 갈래는 1~2문장");
    expect(prompt).toContain("아직 하는 중");
    expect(prompt).toContain("either 이면 한 장으로 만들지 여러 장짜리 카드뉴스로 만들지 묻는 한 문장");
    expect(prompt).toContain("어떤 모양으로 만들지 묻는 한 문장");
    expect(prompt).not.toContain("면 `reply` 는 빈 글로 두세요");
    expect(prompt).not.toContain("`detail_page` 도 `reply` 는 빈 글로");
  });

  /**
   * 2차 최종 리뷰 g — 글 고치기 · 게시글의 끝 문장은 일을 마친 뒤 대화에 남는다. 「고칠게요」면 시제가 틀린다.
   * Task 9 리뷰 — 카드뉴스 원고 · 원고 고치기도 원고가 다 된 뒤에 보인다(1~2분 뒤). 「쓰겠습니다」면 다 된 원고
   * 바로 위에서 시제가 틀린다. 이미지 만들기 · 고치기만 「하는 중」이다(그림은 화면이 나중에 받는다).
   */
  it("원고 · 원고 고치기 · 글 고치기 · 게시글은 끝난 일로, 이미지 만들기 · 고치기만 하는 중으로 쓰게 한다", () => {
    const prompt = easyChatPrompt([], "2번 더 짧게", 0, true, true, true);
    expect(prompt).toContain("cardnews · revise · card_text · caption 이면 일을 마친 뒤에 보이는 말입니다");
    expect(prompt).toMatch(/ image · image_edit 이면 무엇을 이해했고/);
    expect(prompt).not.toMatch(/cardnews[^\n]*무엇을 이해했고 지금 무엇을 하는지/);
    expect(prompt).toContain("장 수 · 내용처럼 아직 모르는 것은 지어내지 마세요");
    // 원고가 없는 대화에서도 카드뉴스 원고는 끝난 일이다.
    expect(easyChatPrompt([], "안녕")).toContain("  cardnews 이면 일을 마친 뒤에 보이는 말입니다");
    expect(easyChatPrompt([], "안녕")).toMatch(/ image 이면 무엇을 이해했고/);
  });

  it("지난 대화는 사용자 말 8번까지 싣는다 — 물음 · 머리말 줄이 많아도 (2차 §3-4)", () => {
    const 대화 = Array.from({ length: 10 }, (_, at) => [
      말("user", `말${at}`, `u${at}`), 말("assistant", sayBody(`머리말${at}`), `s${at}`), 말("assistant", `답${at}`, `a${at}`),
    ]).flat();
    const prompt = easyChatPrompt(대화, "마지막");
    expect(prompt).toContain("사용자: 말2\n");
    expect(prompt).not.toContain("사용자: 말1\n");
    expect(prompt).toContain("도우미: 머리말9");
    expect(prompt).not.toContain("say:");
  });
});

describe("카드뉴스 사실 (2차 D4)", () => {
  it("원고가 있으면 장수와 만드는 중인지 알린다 — 만드는 중이면 고치지 말고 말로 답하게", () => {
    const prompt = easyChatPrompt([], "3번 다시", 0, true, true, false, { cards: { count: 6, generating: true } });
    expect(prompt).toContain("이 대화의 카드뉴스는 6장입니다");
    expect(prompt).toContain("지금 카드를 만드는 중입니다");
    expect(easyChatPrompt([], "3번 다시", 0, true, true, false, { cards: { count: 6, generating: false } })).not.toContain("만드는 중입니다");
    expect(easyChatPrompt([], "안녕", 0, false, false, false, { cards: { count: 6, generating: false } })).not.toContain("6장입니다");
  });

  /** Task 10 고침 2 — 카드가 없으면 「0장 · 1부터 0까지」를 말하지 않는다. */
  it("장수가 0 이면 카드 사실을 싣지 않는다", () => {
    expect(easyChatPrompt([], "3번 다시", 0, true, false, false, { cards: { count: 0, generating: false } })).not.toContain("이 대화의 카드뉴스는");
  });
});

describe("이미지를 보고 답할 때 (2차 D5)", () => {
  const 한장 = [{ n: 1, rowId: "i1", workId: "p1", kind: "image" as const, state: "done" as const, words: "a" }];

  it("다 만든 이미지나 붙인 사진이 있을 때만 볼 것(see)을 적는 법을 알린다", () => {
    expect(easyChatPrompt([], "방금 거 어때?", 0, false, false, true, { images: 한장 })).toContain("`see` 에 볼 것을 적으세요");
    expect(easyChatPrompt([], "이 사진 어때?", 1)).toContain("「p1」");
    expect(easyChatPrompt([], "안녕")).not.toContain("`see`");
    // 카드뉴스 번호만 있으면 볼 이미지가 없다.
    expect(easyChatPrompt([], "어때?", 0, false, false, false, { images: [{ ...한장[0]!, kind: "cardnews" as const }] })).not.toContain("`see`");
  });

  /** 2차 최종 리뷰 10 — 볼 것이 없으면 판단 모델의 답이 그대로 나간다. 「살펴볼게요」 한마디로 두지 않게 한다. */
  it("볼 것을 적어도 reply 는 혼자서도 뜻이 통하게 쓰게 한다", () => {
    const prompt = easyChatPrompt([], "방금 거 어때?", 0, false, false, true, { images: 한장 });
    expect(prompt).toContain("reply 도 혼자서도 뜻이 통하게 쓰세요");
    expect(prompt).not.toContain("「살펴볼게요.」처럼 짧게");
  });

  it("볼 것은 talk 일 때만, 모양이 맞는 것만, 겹친 것 빼고 네 개까지 읽는다", () => {
    expect(readEasyDecision({ wants: "talk", reply: "살펴볼게요.", see: ["1", "p2", "x", "1", "p1", "3", "4"] }).see).toEqual(["1", "p2", "p1", "3"]);
    expect(readEasyDecision({ wants: "image", reply: "", see: ["1"] }).see).toBeUndefined();
    expect(readEasyDecision({ wants: "talk", reply: "네" })).toEqual({ wants: "talk", reply: "네" });
  });
});
