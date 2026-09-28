import { describe, expect, it } from "vitest";
import { ANSWER_SPEC, DECIDE_SPEC, answerPrompt, decidePrompt, transcriptOf } from "../prompt";
import { ACCOUNT_TOPICS } from "../topics";

/**
 * **봇에게 주는 말**(설계 §4.2·§6.3).
 *
 * ── 프롬프트는 두 번째 방어선이다 ──────────────────────────
 *
 * 여기 적은 것이 뚫려도 아무 일이 안 일어나야 한다. 남의 계정은 **읽기
 * 함수가 세션 주인으로만 읽어서** 막히는 것이지 여기 적어서 막히는 것이
 * 아니다. 그래도 적어 두면 엉뚱한 갈래를 고르는 일 자체가 줄어든다.
 */

const 대화 = [
  { role: "user" as const, text: "크레딧이 뭔가요?" },
  { role: "bot" as const, text: "이미지 1장에 1크레딧입니다." },
];

describe("지난 대화", () => {
  it("**오간 말을 누가 했는지와 함께 적는다**", () => {
    const 글 = transcriptOf(대화);

    expect(글).toContain("사용자: 크레딧이 뭔가요?");
    expect(글).toContain("도우미: 이미지 1장에 1크레딧입니다.");
  });

  it("**첫 물음이면 그렇다고 적는다** — 빈 자리를 두지 않는다", () => {
    expect(transcriptOf([])).toContain("첫 물음");
  });

  it("**길면 뒤에서 자른다** — 값만 든다", () => {
    const 긴것 = Array.from({ length: 30 }, (_, i) => ({ role: "user" as const, text: `말 ${i}` }));

    const 글 = transcriptOf(긴것, 5);

    expect(글.split("\n")).toHaveLength(5);
    expect(글, "최근 말이 잘렸다").toContain("말 29");
  });
});

describe("갈래 가르기 물음", () => {
  const 글 = decidePrompt("크레딧 얼마 남았어요?", 대화);

  it("**네 갈래를 알려 준다**", () => {
    for (const kind of ["guide", "account", "smalltalk", "handoff"]) {
      expect(글, `${kind} 를 안 알려 준다`).toContain(kind);
    }
  });

  it("**고를 수 있는 계정 갈래를 전부 적는다**", () => {
    for (const topic of ACCOUNT_TOPICS) {
      expect(글, `${topic} 이 빠졌다`).toContain(topic);
    }
  });

  /**
   * **남의 계정은 갈래 자체가 없다고 말한다.** 이것이 두 번째 방어선이다 —
   * 막는 것은 읽기 함수지만, 여기 적어 두면 엉뚱한 시도가 줄어든다.
   */
  it("**남의 계정은 담당자 일이라고 적는다**", () => {
    expect(글).toContain("남의 계정은 갈래 자체가 없다");
    expect(글).toContain("handoff");
  });

  it("**지난 대화와 마지막 말을 함께 준다**", () => {
    expect(글).toContain("크레딧이 뭔가요?");
    expect(글).toContain("크레딧 얼마 남았어요?");
  });

  it("**답은 아직 쓰지 말라고 한다**", () => {
    expect(글).toContain("답은 아직 쓰지 않는다");
  });
});

/**
 * **틀에 없으면 아무리 시켜도 안 온다.** 구조화 응답은 틀에 없는 칸을
 * 버린다 — 이 저장소가 두 번 당했다(`invented`·`hasText`).
 */
describe("돌려받을 틀", () => {
  it("**갈래 넷이 틀에 박혀 있다**", () => {
    const kind = (DECIDE_SPEC.schema.properties as never as { kind: { enum: string[] } }).kind;

    expect(kind.enum).toEqual(["guide", "account", "smalltalk", "handoff"]);
  });

  it("**계정 갈래도 틀에 박혀 있다** — 아무 이름이나 못 온다", () => {
    const topics = (DECIDE_SPEC.schema.properties as never as { topics: { items: { enum: string[] } } }).topics;

    expect(topics.items.enum).toEqual([...ACCOUNT_TOPICS]);
  });

  /**
   * **`required` 에 넣는 까닭.** 구조화 응답은 안 채운 칸을 그냥 빼 버려서,
   * 모델이 「없음」을 말할 길이 없으면 아무 값이나 채운다.
   */
  it("**칸을 다 채우게 한다**", () => {
    expect(DECIDE_SPEC.schema.required).toEqual(["kind", "topics", "query"]);
    expect(ANSWER_SPEC.schema.required).toEqual(["answered", "reply"]);
  });

  /**
   * **「답했는가」를 따로 받는다.** 답 글만 받으면 모델이 「모르겠습니다」를
   * 답처럼 써 보내고, 화면은 그것을 답으로 그린다.
   */
  it("**답했는지를 따로 받는다**", () => {
    const answered = (ANSWER_SPEC.schema.properties as never as { answered: { type: string } }).answered;

    expect(answered.type).toBe("boolean");
  });
});

describe("답 쓰기 물음", () => {
  const 글 = answerPrompt({
    question: "크레딧 얼마 남았어요?",
    turns: 대화,
    evidence: "[1] 이용 안내 · 크레딧\n이미지 1장에 1크레딧",
    facts: ["남은 크레딧은 70장입니다."],
  });

  it("**자료에 있는 것만 답하라고 한다**", () => {
    expect(글).toContain("자료에 있는 것만");
    expect(글).toContain("지어내지 마라");
  });

  /**
   * **숫자를 모델이 세지 않게 한다.** 「9월 30일까지면 며칠 남았나」를
   * 모델이 세면 틀린다. `account-facts.ts` 가 이미 세 두었다.
   */
  it("**숫자를 새로 세지 말라고 한다**", () => {
    expect(글).toContain("새로 세지 마라");
  });

  it("**계정 사실을 확인된 값이라고 준다**", () => {
    expect(글).toContain("남은 크레딧은 70장입니다");
    expect(글).toContain("확인된 값");
  });

  it("**찾은 자료를 함께 준다**", () => {
    expect(글).toContain("[1] 이용 안내 · 크레딧");
  });

  it("**모르면 false 로 두라고 한다**", () => {
    expect(글).toContain("`answered` 를 false");
  });

  /** 화면 문구 규칙. 줄표를 쓰지 않는다. */
  it("**줄표를 쓰지 말라고 한다**", () => {
    expect(글).toContain("줄표");
  });

  it("**계정 사실이 없으면 그 자리를 안 만든다**", () => {
    const 것 = answerPrompt({ question: "x", turns: [], evidence: "자료" });

    expect(것).not.toContain("계정 사실");
  });

  it("**자료가 없으면 그 자리를 안 만든다**", () => {
    const 것 = answerPrompt({ question: "x", turns: [], evidence: "", facts: ["사실"] });

    expect(것).not.toContain("설명서에서 찾은 자료");
  });
});
