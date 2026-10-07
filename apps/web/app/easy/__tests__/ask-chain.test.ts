import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASK_ANSWER_NOTE, answerableAskId, askAnchor, askChain, askInstruction, buttonDecision, chosenFor, closedAnswerRows,
  readButtonAnswer, readEasyPick, settleTypedAnswer,
} from "../ask-chain";
import { askBody, sayBody, withPick } from "../row-marks";
import { AD_ANSWER_NOTE, AD_CHOICE_IMAGE, AD_QUESTION } from "../ad-ask";
import { CANNOT_DO_NOW, NOTHING_TO_EDIT, fitButtonDecision } from "../chat";
import { NOT_MADE_YET } from "../cardnews-after";
import { failureRowBody } from "../../../lib/easy/failure-row";
import { ASK_TARGET_NOTE } from "../chat-facts";

/**
 * **물음 사슬**(2026-10-07 2차 설계 D1 · §3-1). 화면은 처음 말을 다시 보내지 않는다. 서버가 대화
 * 줄을 거슬러 처음 말 · 말로 한 답 · 단추로 고른 값 · 사진을 모은다.
 */
type R = { id: string; role: "user" | "assistant" | "image"; body: string };
const 말 = (id: string, body: string): R => ({ id, role: "user", body });
const 도우미 = (id: string, body: string): R => ({ id, role: "assistant", body });
const 물음 = (id: string, kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}) =>
  도우미(id, askBody(kind, `${kind} 물음?`, data));

describe("마지막 물음 자리", () => {
  it("마지막 줄이 물음이면 그 자리, 아니면 -1", () => {
    expect(askAnchor([말("u1", "바다"), 물음("q1", "ratio")])).toBe(1);
    expect(askAnchor([말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "고양이"), 도우미("a", "네")])).toBe(-1);
    expect(askAnchor([])).toBe(-1);
  });

  /** 최종 수정 2 — 서버가 답으로 본 말 답은 `typed` 표시가 붙는다. 그 답이 실패한 짝은 건너뛴다. */
  it("답으로 본 말 답(typed 표시)이 실패한 짝도 건너뛴다", () => {
    const 말답실패 = [
      말("u1", "바다"), 물음("q1", "ratio"), 말("u2", withPick("세로로", { typed: true })),
      도우미("s", sayBody("세로로 만들겠습니다.")), 도우미("f", failureRowBody("x")),
    ];
    expect(askAnchor(말답실패)).toBe(1);
    expect(askChain(말답실패)).toMatchObject({ origin: "바다", answers: [] });
  });

  it("단추로 답했다가 실패한 짝은 건너뛴다 — 말로 한 답의 실패는 안 건너뛴다", () => {
    const 단추실패 = [말("u1", "바다"), 물음("q1", "ratio"), 말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("f", failureRowBody("x"))];
    expect(askAnchor(단추실패)).toBe(1);
    const 말실패 = [말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "세로로"), 도우미("f", failureRowBody("x"))];
    expect(askAnchor(말실패)).toBe(-1);
  });

  /** 2차 최종 리뷰 2 · Review Focus 1 — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄이다. 머리말 뒤 실패도 짝이다. */
  it("머리말 줄이 끼어든 단추 답 실패 짝도 건너뛴다 — 머리말만 있고 실패가 없으면 안 건너뛴다", () => {
    const 머리말실패 = [
      말("u1", "바다"), 물음("q1", "ratio"), 말("u2", withPick("이대로 만들기", { ratio: "1:1" })),
      도우미("s", sayBody("바다 이미지를 만들겠습니다.")), 도우미("f", failureRowBody("x")),
    ];
    expect(askAnchor(머리말실패)).toBe(1);
    expect(askAnchor(머리말실패.slice(0, 4))).toBe(-1);
  });
});

describe("지금 답할 수 있는 물음 줄 (화면의 단추 자리, Review Focus 1)", () => {
  const 앞 = [말("u1", "바다"), 물음("q1", "ratio")];

  it("마지막 줄이 물음이면 그 줄", () => {
    expect(answerableAskId(앞)).toBe("q1");
    expect(answerableAskId([말("u1", "광고 소재"), 도우미("q1", AD_QUESTION)])).toBe("q1");
  });

  it("다시 열었을 때 [물음, 단추 답, (머리말), 실패] 면 그 물음 줄", () => {
    const 단추 = 말("u2", withPick("이대로 만들기", { ratio: "1:1" }));
    expect(answerableAskId([...앞, 단추, 도우미("f", failureRowBody("x"))])).toBe("q1");
    expect(answerableAskId([...앞, 단추, 도우미("s", sayBody("만들겠습니다.")), 도우미("f", failureRowBody("x"))])).toBe("q1");
  });

  /** 화면은 실패 줄을 다시 열 때 받는다. 그 자리에서 실패하면 [물음, 단추 답] 으로 끝나 있다 — 서버에는 실패 줄이 있다. */
  it("그 자리에서 단추 답이 실패해 [물음, 단추 답] 으로 끝났어도 그 물음 줄 — 광고 단추 글도 같다", () => {
    expect(answerableAskId([...앞, 말("u2", withPick("이대로 만들기", { ratio: "1:1" }))])).toBe("q1");
    expect(answerableAskId([말("u1", "광고 소재"), 도우미("q1", AD_QUESTION), 말("u2", AD_CHOICE_IMAGE)])).toBe("q1");
  });

  it("말로 한 답 뒤 · 만들기가 이어진 뒤 · 물음이 없으면 없다", () => {
    expect(answerableAskId([...앞, 말("u2", "세로로")])).toBeUndefined();
    expect(answerableAskId([...앞, 말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("s", sayBody("만들겠습니다.")), { id: "i1", role: "image", body: "" }])).toBeUndefined();
    expect(answerableAskId([말("u1", "안녕"), 도우미("a", "안녕하세요")])).toBeUndefined();
  });
});

/**
 * 후속 Task 3 — 장 물음에 다시 그리기로 답하면(`cardAsk`) 서버는 사용자 줄을 고른 값 표시 없이 남겨 물음을 닫는다.
 * 화면이 붙인 줄에 표시가 남으면 [물음, 단추 답] 대체 규칙으로 단추가 새로고침 전까지 다시 떴다.
 */
describe("서버가 닫은 장 물음 답은 화면 줄에서도 표시를 뗀다 (closedAnswerRows)", () => {
  const 장물음 = 물음("q1", "card", { wants: "card_redo", count: 5 });
  const 앞 = [말("u1", "카드뉴스 다시 그려줘"), 장물음];
  const 단추답 = 말("user-pending-1", withPick("2번", { card: 2 }));

  it("「2번」 단추 → cardAsk 응답 뒤에는 단추를 달 물음이 없다 — 서버 줄과 같다", () => {
    expect(answerableAskId([...앞, 단추답])).toBe("q1");
    const 줄 = closedAnswerRows([...앞, 단추답], "user-pending-1", "2번");
    expect(줄).toEqual([...앞, 말("user-pending-1", "2번")]);
    expect(answerableAskId(줄)).toBeUndefined();
  });

  it("다른 줄과 받은 목록은 그대로 둔다(새 목록)", () => {
    const 원래 = [...앞, 단추답];
    const 줄 = closedAnswerRows(원래, "user-pending-1", "2번");
    expect(원래[2]!.body).toBe(withPick("2번", { card: 2 }));
    expect(줄[0]).toBe(원래[0]);
    expect(줄[1]).toBe(원래[1]);
    expect(closedAnswerRows(원래, "없는-id", "2번")).toEqual(원래);
  });

  /** Review Focus 4 — 실패한 단추 답은 다시 눌러야 한다. 표시 떼기는 성공한 cardAsk 응답에서만. */
  it("화면은 성공한 cardAsk 응답에서만 표시를 떼고, 실패 길에서는 안 뗀다 — 실패하면 단추가 남는다", () => {
    const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");
    const 떼기 = 화면.indexOf("if (body.ok && body.cardAsk) setMessages((current) => closedAnswerRows(current, `user-${자리}`, prompt));");
    expect(떼기).toBeGreaterThan(0);
    expect(떼기).toBeLessThan(화면.indexOf("if (body.ok && cardnews.take(body)) return;"));
    expect(화면.split("closedAnswerRows(").length).toBe(2);
    expect(answerableAskId([...앞, 단추답])).toBe("q1");
  });
});

describe("물음 사슬 (askChain)", () => {
  it("처음 말 · 물음 · 사진 id 를 모은다", () => {
    expect(askChain([말("u1", "신메뉴 홍보물 만들어줘"), 물음("q1", "kind", { ids: ["p1"] })])).toMatchObject({
      ask: { id: "q1", kind: "kind" }, origin: "신메뉴 홍보물 만들어줘", answers: [], picks: {}, photoIds: ["p1"],
    });
  });

  it("이어진 물음(cont)이면 거슬러 가며 말 답과 단추 값을 모은다", () => {
    const rows = [
      말("u1", "신메뉴 홍보물 만들어줘"), 물음("q1", "kind", { ids: ["p1"] }),
      말("u2", withPick("이미지 한 장", { kind: "image" })), 물음("q2", "ratio", { cont: true, wants: "image" }),
      말("u3", "세로로 해줘"), 물음("q3", "photo", { cont: true, ids: [] }),
    ];
    expect(askChain(rows)).toMatchObject({
      ask: { id: "q3", kind: "photo" }, origin: "신메뉴 홍보물 만들어줘", answers: ["세로로 해줘"],
      picks: { kind: "image" }, photoIds: ["p1"],
    });
  });

  it("뒤에 고른 단추 값이 앞의 것을 덮는다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이걸로", { ratio: "4:5" })), 물음("q2", "photo", { cont: true }),
      말("u3", withPick("이걸로", { ratio: "9:16" })), 물음("q3", "kind", { cont: true }),
    ];
    expect(askChain(rows)?.picks).toEqual({ ratio: "9:16" });
  });

  it("이어지지 않은 물음(cont 없음)이면 바로 앞 말이 처음 말이다 — 앞 물음의 값을 안 잇는다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "kind", { ids: ["p1"] }),
      말("u2", "아니 고양이 포스터 만들어줘"), 물음("q2", "ratio", { wants: "image" }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "아니 고양이 포스터 만들어줘", answers: [], picks: {}, photoIds: [] });
  });

  it("광고 물음(본문 완전일치)도 사슬의 물음이다 — 광고 단추 글은 말 답으로 안 친다", () => {
    const rows = [
      말("u1", "겨울 화장품 광고 소재 만들어줘"), 도우미("q1", AD_QUESTION),
      말("u2", AD_CHOICE_IMAGE), 물음("q2", "ratio", { cont: true, wants: "image" }),
    ];
    expect(askChain(rows)).toMatchObject({ ask: { id: "q2" }, origin: "겨울 화장품 광고 소재 만들어줘", answers: [] });
  });

  it("단추 답 실패 짝이 사슬 가운데 있어도 건너뛴다", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("f", failureRowBody("x")),
      말("u3", "세로로"), 물음("q2", "photo", { cont: true }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "바다", answers: ["세로로"] });
  });

  it("머리말 줄이 낀 단추 답 실패 짝이 사슬 가운데 있어도 건너뛴다 (2차 최종 리뷰 2)", () => {
    const rows = [
      말("u1", "바다"), 물음("q1", "ratio"),
      말("u2", withPick("이대로 만들기", { ratio: "1:1" })), 도우미("s", sayBody("만들겠습니다.")), 도우미("f", failureRowBody("x")),
      말("u3", "세로로"), 물음("q2", "photo", { cont: true }),
    ];
    expect(askChain(rows)).toMatchObject({ origin: "바다", answers: ["세로로"] });
  });

  /** 2차 최종 리뷰 8 — 사진 고르기가 열린 채 친 말은 고른 값과 함께 오지만 그 말도 답이다. */
  it("말로 친 사진 답(typed)은 고른 값을 잇고 그 말도 말 답으로 잇는다 — typed 표시는 고른 값에 안 남긴다", () => {
    const rows = [
      말("u1", "1번 제품으로 포스터"), 물음("q1", "photo", { ids: ["p1"] }),
      말("u2", withPick("1번은 우리 원두 봉투야", { photoRoles: [{ id: "p1", role: "preserve_product" }], typed: true })),
      물음("q2", "photo", { cont: true, reason: "people" }),
    ];
    expect(askChain(rows)).toMatchObject({
      origin: "1번 제품으로 포스터", answers: ["1번은 우리 원두 봉투야"], picks: { photoRoles: [{ id: "p1", role: "preserve_product" }] },
    });
    expect(askChain(rows)?.picks).not.toHaveProperty("typed");
  });

  it("물음이 마지막이 아니면 사슬이 없다", () => {
    expect(askChain([말("u1", "바다"), 물음("q1", "ratio"), 말("u2", "고마워"), 도우미("a", "네")])).toBeUndefined();
  });
});

describe("지시 조립 (askInstruction)", () => {
  const chain = askChain([말("u1", "바다 포스터"), 물음("q1", "kind"), 말("u2", "한 장으로"), 물음("q2", "ratio", { cont: true })])!;

  it("단추 답이면 처음 말 + 앞의 말 답", () => {
    expect(askInstruction(chain, "이대로 만들기", "button")).toBe("바다 포스터\n한 장으로");
  });

  it("말로 한 답이면 이번 말도 잇는다", () => {
    expect(askInstruction(chain, "세로로", "typed")).toBe("바다 포스터\n한 장으로\n세로로");
  });

  it("답이 아니거나 사슬이 없으면 이번 말 그대로", () => {
    expect(askInstruction(chain, "고양이 포스터", "none")).toBe("고양이 포스터");
    expect(askInstruction(undefined, "고양이 포스터", "typed")).toBe("고양이 포스터");
  });

  it("번호만 고르는 물음(어느 이미지 · 몇 번 장)의 말 답은 지시에 안 넣는다", () => {
    const 번호 = askChain([말("u1", "배경만 파랗게"), 물음("q1", "target", { numbers: [1, 2] })])!;
    expect(askInstruction(번호, "2번", "typed")).toBe("배경만 파랗게");
  });

  it("옛 화면이 처음 말을 다시 보내도 두 번 잇지 않는다", () => {
    const 하나 = askChain([말("u1", "바다 포스터"), 물음("q1", "ratio")])!;
    expect(askInstruction(하나, "바다 포스터", "typed")).toBe("바다 포스터");
  });
});

describe("단추 답 받기 (Review Focus 1)", () => {
  const rows = [말("u1", "바다 포스터"), 물음("q1", "ratio", { wants: "image" })];

  it("지금 마지막 물음 줄의 단추만 받는다", () => {
    expect(readButtonAnswer({ answersRowId: "q1", pick: { ratio: "1:1" } }, rows))
      .toMatchObject({ chain: { ask: { id: "q1" } }, pick: { ratio: "1:1" } });
  });

  it("지난 물음 줄 id · 없는 id · 광고 물음이면 받지 않는다", () => {
    const 지난 = [...rows, 말("u2", "고마워"), 도우미("a", "네"), 말("u3", "고양이"), 물음("q2", "ratio")];
    expect(readButtonAnswer({ answersRowId: "q1", pick: { ratio: "1:1" } }, 지난)).toBeUndefined();
    expect(readButtonAnswer({ answersRowId: "nope" }, rows)).toBeUndefined();
    expect(readButtonAnswer({}, rows)).toBeUndefined();
    expect(readButtonAnswer({ answersRowId: "q1" }, [말("u1", "광고 소재"), 도우미("q1", AD_QUESTION)])).toBeUndefined();
  });

  it("고른 값은 모양만 거른다", () => {
    expect(readEasyPick({ kind: "poster", ratio: "x".repeat(41), target: 0, card: 2.5, photoRoles: [{ id: "a", role: "style" }, { id: 3 }] }))
      .toEqual({ photoRoles: [{ id: "a", role: "style" }] });
    expect(readEasyPick(null)).toEqual({});
    // 말로 친 사진 답의 표시(2차 최종 리뷰 8). 참일 때만 남긴다.
    expect(readEasyPick({ ratio: "1:1", typed: true })).toEqual({ ratio: "1:1", typed: true });
    expect(readEasyPick({ typed: "yes" })).toEqual({});
  });
});

/** 2차 최종 리뷰 1 · Review Focus 7 — 물은 뒤 고칠 것이 사라진 단추 답이 만들기로 새면 값이 나간다. */
describe("쓸 수 없게 된 단추 답은 다른 일로 새지 않고 사실 문장으로 끝낸다", () => {
  const 번호답 = { wants: "image_edit" as const, reply: "", target: 2 };
  const 장답 = { wants: "card_text" as const, reply: "", card: 2, note: "더 짧게" };

  it("쓸 수 있으면 그대로다", () => {
    expect(fitButtonDecision(번호답, { editableImage: true })).toBe(번호답);
    expect(fitButtonDecision(장답, { canRevise: true })).toBe(장답);
    expect(fitButtonDecision({ wants: "image", reply: "" }, {})).toEqual({ wants: "image", reply: "" });
  });

  it("고칠 이미지 · 원고가 다 없으면 판단 읽기와 같은 사실 문장", () => {
    expect(fitButtonDecision(번호답, {})).toEqual({ wants: "talk", reply: NOTHING_TO_EDIT });
    expect(fitButtonDecision(장답, {})).toEqual({ wants: "talk", reply: NOTHING_TO_EDIT });
    expect(fitButtonDecision({ wants: "card_redo", reply: "", card: 1 }, { canRevise: true, made: false }))
      .toEqual({ wants: "talk", reply: NOT_MADE_YET });
  });

  /** 판단 읽기는 원고가 없으면 장 고치기를 이미지 고치기로 바꿔 읽는다 — 단추 답이 그렇게 새면 이미지 고치기 값이 나간다. */
  it("판단 읽기라면 다른 일하는 갈래로 바꿔 읽을 자리면 그 일로 안 가고 사실만 말한다", () => {
    expect(fitButtonDecision(장답, { editableImage: true })).toEqual({ wants: "talk", reply: CANNOT_DO_NOW });
    expect(fitButtonDecision(번호답, { canRevise: true })).toEqual({ wants: "talk", reply: CANNOT_DO_NOW });
  });
});

/** 2차 최종 리뷰 6 · Review Focus 8 — 말로 한 답이 같은 물음을 되풀이하거나 처음 말을 잃지 않게. */
describe("말로 한 답의 갈래 정리 (settleTypedAnswer)", () => {
  const 물음줄 = (kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}) =>
    askChain([말("u1", "처음"), 물음("q1", kind, data)])!.ask;

  it("물음이 없으면 판단 그대로 · 답 아님 · 모양은 물어도 된다", () => {
    const decision = { wants: "image" as const, reply: "" };
    expect(settleTypedAnswer(undefined, decision)).toEqual({ decision, answered: false, askRatio: true });
  });

  it("모양 물음 뒤에는 답이든 아니든 모양을 다시 묻지 않는다", () => {
    expect(settleTypedAnswer(물음줄("ratio"), { wants: "image", reply: "", note: ASK_ANSWER_NOTE }))
      .toMatchObject({ answered: true, askRatio: false });
    expect(settleTypedAnswer(물음줄("ratio"), { wants: "image", reply: "" }))
      .toMatchObject({ answered: false, askRatio: false });
  });

  it("갈래 물음 뒤에 또 either 면 한 장으로 가고 답으로 본다 — 그 reply(갈래 물음)는 버린다", () => {
    expect(settleTypedAnswer(물음줄("kind"), { wants: "either", reply: "한 장으로 할까요?" })).toEqual({
      decision: { wants: "image", reply: "", note: ASK_ANSWER_NOTE }, answered: true, askRatio: true,
    });
    expect(settleTypedAnswer(물음줄("kind"), { wants: "cardnews", reply: "" })).toMatchObject({ answered: false });
  });

  it("번호 물음 바로 뒤 image_edit 이면 note 가 없어도 답이다", () => {
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), { wants: "image_edit", reply: "", target: 2 }))
      .toMatchObject({ answered: true, decision: { wants: "image_edit", target: 2 } });
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), { wants: "image", reply: "" })).toMatchObject({ answered: false });
  });

  it("장 물음 바로 뒤 장 갈래면 note 가 없어도 답이고, 바라는 점은 물을 때의 것을 쓴다", () => {
    const 장 = 물음줄("card", { wants: "card_text", count: 3, note: "더 짧게" });
    expect(settleTypedAnswer(장, { wants: "card_text", reply: "", card: 2 }))
      .toEqual({ decision: { wants: "card_text", reply: "", card: 2, note: "더 짧게" }, answered: true, askRatio: true });
    // 모델이 note 에 answer 를 적어도 고칠 내용으로 쓰지 않는다.
    expect(settleTypedAnswer(장, { wants: "card_redo", reply: "", card: 1, note: ASK_ANSWER_NOTE }).decision.note).toBe("더 짧게");
    expect(settleTypedAnswer(장, { wants: "card_text", reply: "", card: 2, note: "제목만" }).decision.note).toBe("제목만");
  });

  /**
   * 최종 수정 1 — 번호 물음에 「그거요」처럼 번호 없이 답하면 판단 모델이 talk + ask_target 으로 다시 묻는다. 그 말을 답으로
   * 안 보면 새 물음 줄에 `cont` 가 없어 사슬의 처음 말이 「그거요」가 되고, 단추로 고르면 「그거요」로 고친다(값이 나간다).
   */
  it("번호 물음 바로 뒤 talk + ask_target(다시 묻기)이면 답으로 본다 — 다른 물음 뒤면 아니다", () => {
    const 다시묻기 = { wants: "talk" as const, reply: "몇 번 이미지를 고칠까요?", note: ASK_TARGET_NOTE };
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), 다시묻기)).toEqual({ decision: 다시묻기, answered: true, askRatio: true });
    expect(settleTypedAnswer(물음줄("photo"), 다시묻기)).toMatchObject({ answered: false });
    expect(settleTypedAnswer(물음줄("target", { numbers: [1, 2] }), { wants: "talk", reply: "네" })).toMatchObject({ answered: false });
  });

  it("사진 · 레퍼런스 · 광고 물음은 note 의 answer 로만 답이다", () => {
    expect(settleTypedAnswer(물음줄("photo"), { wants: "image", reply: "", note: ASK_ANSWER_NOTE })).toMatchObject({ answered: true });
    expect(settleTypedAnswer(물음줄("reference"), { wants: "cardnews", reply: "" })).toMatchObject({ answered: false });
  });
});

describe("단추 답의 판단 — 글 모델을 안 부른다", () => {
  const 답 = (kind: Parameters<typeof askBody>[0], data: Record<string, unknown>, pick: Record<string, unknown>) =>
    buttonDecision(readButtonAnswer({ answersRowId: "q1", pick }, [말("u1", "처음"), 물음("q1", kind, data)])!);

  it("갈래 · 모양 · 사진 · 레퍼런스 · 이미지 번호 · 장 번호", () => {
    expect(답("kind", { ratio: "4:5" }, { kind: "cardnews" })).toEqual({ wants: "cardnews", reply: "", ratio: "4:5" });
    expect(답("ratio", { wants: "image" }, { ratio: "1:1" })).toEqual({ wants: "image", reply: "" });
    expect(답("photo", { wants: "cardnews" }, { photoRoles: [] })).toEqual({ wants: "cardnews", reply: "" });
    expect(답("photo", { wants: "image", look: "anime" }, {})).toEqual({ wants: "image", reply: "", look: "anime" });
    expect(답("reference", {}, { kind: "cardnews" })).toEqual({ wants: "cardnews", reply: "" });
    expect(답("target", { numbers: [1, 2] }, { target: 2 })).toEqual({ wants: "image_edit", reply: "", target: 2 });
    expect(답("card", { wants: "card_text", note: "더 짧게" }, { card: 3 }))
      .toEqual({ wants: "card_text", reply: "", card: 3, note: "더 짧게" });
  });

  it("고른 값이 모자라면 판단을 못 만든다 — 그때는 말로 보고 판단 모델이 가른다", () => {
    expect(답("kind", {}, {})).toBeUndefined();
    expect(답("target", {}, {})).toBeUndefined();
    expect(답("card", { wants: "caption" }, { card: 1 })).toBeUndefined();
  });
});

describe("이번 턴에 쓸 고른 값 (chosenFor)", () => {
  const chain = askChain([
    말("u1", "바다"), 물음("q1", "kind"), 말("u2", withPick("이미지 한 장", { kind: "image" })), 물음("q2", "ratio", { cont: true }),
  ])!;

  it("단추로 이어 답하면 앞서 고른 갈래까지 고른 것이다(1차 A2)", () => {
    expect(chosenFor({}, chain, { ratio: "4:5" })).toEqual({ kind: "image", kindPicked: true, ratio: "4:5" });
  });

  it("말로 한 답이면 갈래는 잇되 고른 것은 아니다", () => {
    expect(chosenFor({}, chain, undefined)).toEqual({ kind: "image", kindPicked: false });
  });

  /** Review Focus 5 — 답이 아니면 라우트가 사슬을 안 넘긴다. 옛 값이 몰래 안 붙는다. */
  it("사슬이 없으면 옛 화면이 보낸 칸만 쓴다", () => {
    expect(chosenFor({}, undefined, undefined)).toEqual({ kindPicked: false });
    expect(chosenFor({ kind: "image", kindPicked: true, ratio: "1:1", photoRoles: [{ id: "a", role: "style" }] }, undefined, undefined))
      .toEqual({ kind: "image", kindPicked: true, ratio: "1:1", photoRoles: [{ id: "a", role: "style" }] });
  });

  it("답이라고 적는 값은 1차 광고 물음의 것과 같다", () => {
    expect(ASK_ANSWER_NOTE).toBe(AD_ANSWER_NOTE);
  });
});

/**
 * Task 8 고침 1 — 번호 물음 · 장 물음의 말 답은 **번호를 고르는 말**이다. 번호가 없는 답(「그거요」)은 지시에 아무것도
 * 더하지 않고, 번호만 있는 답(「1번이요」)도 그렇다. 번호와 함께 고칠 내용을 말하면(「이미지 1 글자도 크게」) 번호를
 * 뺀 나머지를 처음 말 뒤에 잇는다. 사용자가 한 말을 잃거나 엉뚱한 말이 지시에 섞이지 않게.
 */
describe("번호 물음의 말 답 (Task 8 고침 1)", () => {
  const 번호물음 = [말("u1", "배경만 하얗게"), 물음("q1", "target", { numbers: [1, 2] })];

  it("번호 없는 답 뒤 다시 물어 단추로 고르면 지시는 처음 말뿐이다", () => {
    const 다시 = askChain([...번호물음, 말("u2", "그거요"), 물음("q2", "target", { numbers: [1, 2], cont: true })])!;
    expect(askInstruction(다시, "이미지 1", "button")).toBe("배경만 하얗게");
    expect(askInstruction(다시, "1번", "typed")).toBe("배경만 하얗게");
  });

  it("번호 없는 말 답 · 번호만 있는 말 답은 지시에 더하지 않는다", () => {
    const 하나 = askChain(번호물음)!;
    expect(askInstruction(하나, "그거요", "typed")).toBe("배경만 하얗게");
    expect(askInstruction(하나, "1번이요", "typed")).toBe("배경만 하얗게");
    expect(askInstruction(하나, "이미지 2", "typed")).toBe("배경만 하얗게");
    expect(askInstruction(하나, "2번으로 해 주세요", "typed")).toBe("배경만 하얗게");
    expect(askInstruction(하나, "#2", "typed")).toBe("배경만 하얗게");
  });

  it("번호와 함께 고칠 내용을 말하면 번호를 뺀 나머지를 잇는다", () => {
    const 하나 = askChain(번호물음)!;
    expect(askInstruction(하나, "이미지 1 글자도 크게", "typed")).toBe("배경만 하얗게\n글자도 크게");
    expect(askInstruction(하나, "1번에서 로고도 빼줘", "typed")).toBe("배경만 하얗게\n로고도 빼줘");
    // 번호 말은 처음 하나만 뺀다 — 고칠 내용 속 숫자는 그대로다.
    expect(askInstruction(하나, "이미지 1 글자 2배로", "typed")).toBe("배경만 하얗게\n글자 2배로");
  });

  it("앞 물음에 번호와 함께 한 말도 사슬이 잇는다 — 번호 말은 뺀다", () => {
    const 이어 = askChain([...번호물음, 말("u2", "이미지 1 글자도 크게"), 물음("q2", "ratio", { cont: true })])!;
    expect(askInstruction(이어, "이대로 만들기", "button")).toBe("배경만 하얗게\n글자도 크게");
  });

  it("장 물음도 같다 — 번호만이면 안 더하고, 고칠 내용이 있으면 잇는다", () => {
    const 장 = askChain([말("u1", "더 짧게"), 물음("q1", "card", { wants: "card_text", count: 5 })])!;
    expect(askInstruction(장, "3번", "typed")).toBe("더 짧게");
    expect(askInstruction(장, "3번 장", "typed")).toBe("더 짧게");
    expect(askInstruction(장, "3번 장 제목도 바꿔줘", "typed")).toBe("더 짧게\n제목도 바꿔줘");
  });

  /** 최종 수정 6 — 「첫 번째」 · 「셋째」 같은 서수 말과 전각 숫자(「２번」)도 번호 말이다. */
  it("서수 말 · 전각 숫자도 번호 말이다 — 번호만이면 안 더하고, 고칠 내용이 있으면 잇는다", () => {
    const 하나 = askChain(번호물음)!;
    for (const 번호만 of ["두 번째요", "첫 번째 거", "첫번째 거로 해 주세요", "열 번째 이미지로 해줘", "둘째요", "셋째 거요", "２번", "이미지 ２"]) {
      expect(askInstruction(하나, 번호만, "typed")).toBe("배경만 하얗게");
    }
    expect(askInstruction(하나, "첫 번째 거 배경도 파랗게", "typed")).toBe("배경만 하얗게\n배경도 파랗게");
    expect(askInstruction(하나, "세 번째 글자도 크게", "typed")).toBe("배경만 하얗게\n글자도 크게");
    expect(askInstruction(하나, "이미지 ２ 로고도 빼줘", "typed")).toBe("배경만 하얗게\n로고도 빼줘");
    // 「거울」의 「거」는 번호 말이 아니다 — 사용자 말을 잃지 않는다.
    expect(askInstruction(하나, "두 번째 거울을 지워줘", "typed")).toBe("배경만 하얗게\n거울을 지워줘");
    // 서수가 아닌 「세로」 · 「두 번」은 번호 말이 아니다 — 번호 말이 없는 고칠 내용이라 그대로 잇는다(최종 재검토).
    expect(askInstruction(하나, "세로로 두 번 해줘", "typed")).toBe("배경만 하얗게\n세로로 두 번 해줘");
  });

  /**
   * 최종 재검토 — 번호 물음 뒤 번호 없이 **새 고칠 내용**을 치면(「아니 로고를 바꿔줘」) 판단 모델은 다시 묻는다.
   * 그 말을 버리면 단추로 고를 때 옛 지시로 값이 나간다. 가리키기만 하는 말(「그거요」 · 「아무거나」)만 버린다.
   */
  it("번호 없는 말 답도 가리키는 말이 아니면 잇는다", () => {
    const 하나 = askChain(번호물음)!;
    expect(askInstruction(하나, "아니 로고를 바꿔줘", "typed")).toBe("배경만 하얗게\n아니 로고를 바꿔줘");
    for (const 가리킴 of ["그거요", "이거", "저거요.", "그것으로 해 주세요", "아무거나", "네", "그걸로요", "마지막 거요"]) {
      expect(askInstruction(하나, 가리킴, "typed")).toBe("배경만 하얗게");
    }
    const 다시 = askChain([...번호물음, 말("u2", "아니 로고를 바꿔줘"), 물음("q2", "target", { numbers: [1, 2], cont: true })])!;
    expect(askInstruction(다시, "이미지 2", "button")).toBe("배경만 하얗게\n아니 로고를 바꿔줘");
  });

  it("번호 말 뒤 「것을 · 거예요」 꼬리는 지시에 남기지 않는다", () => {
    const 하나 = askChain(번호물음)!;
    for (const 번호만 of ["첫 번째 것을 고쳐줘", "두 번째 것으로 해 주세요", "두 번째 거예요", "2번 거예요"]) {
      expect(askInstruction(하나, 번호만, "typed")).toBe("배경만 하얗게");
    }
  });

  it("다른 물음의 말 답은 숫자가 있어도 그대로 잇는다", () => {
    const 모양 = askChain([말("u1", "바다 포스터"), 물음("q1", "ratio")])!;
    expect(askInstruction(모양, "2번째 모양으로", "typed")).toBe("바다 포스터\n2번째 모양으로");
  });
});
