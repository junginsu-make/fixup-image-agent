import { describe, expect, it } from "vitest";
import {
  evidenceBlock,
  hasUsableEvidence,
  planFrom,
  showsSources,
  sourcesFrom,
  NO_EVIDENCE,
  HANDOFF,
} from "../answer";

/**
 * **근거 없이 말하지 않는다**(설계 §6.3).
 *
 * 모델은 그럴듯한 말을 잘 만든다. 설명서에 없는 것을 물으면 있는 것처럼
 * 답한다. CS 에서 그것은 「없는 것만 못하다」 — 「결제가 안 돼요」에 잘못
 * 답하면 돈 문제가 된다.
 */

const 조각 = (name: string, content: string, similarity = 0.8) =>
  ({ sourceName: name, chunkIndex: 0, content, similarity }) as never;

describe("무엇을 할지 고른다", () => {
  it("**설명서 물음이면 찾는다**", () => {
    expect(planFrom({ kind: "guide", query: "크레딧 차감" }, "크레딧 어떻게 깎여요?"))
      .toEqual({ act: "search", query: "크레딧 차감" });
  });

  it("**찾을 말을 안 주면 사용자 말을 쓴다**", () => {
    expect(planFrom({ kind: "guide" }, "크레딧 어떻게 깎여요?"))
      .toEqual({ act: "search", query: "크레딧 어떻게 깎여요?" });
  });

  it("**계정 물음이면 고른 갈래만 읽는다**", () => {
    expect(planFrom({ kind: "account", topics: ["balance"] }, "얼마 남았어요?"))
      .toEqual({ act: "account", topics: ["balance"] });
  });

  it("**사람에게 넘기라고 하면 넘긴다**", () => {
    expect(planFrom({ kind: "handoff" }, "환불해 주세요")).toEqual({ act: "handoff" });
  });

  it("**인사면 그냥 말한다**", () => {
    expect(planFrom({ kind: "smalltalk" }, "안녕하세요")).toEqual({ act: "talk" });
  });
});

/**
 * **모델이 만들어 낸 값을 믿지 않는다.**
 *
 * 구조화 응답이라도 목록 밖 값이 오는 일이 있다 — 이 저장소가 두 번 겪었다.
 */
describe("모르는 값이 오면", () => {
  it("**모르는 갈래 이름은 버린다**", () => {
    expect(planFrom({ kind: "account", topics: ["남의크레딧"] }, "질문"))
      .toEqual({ act: "search", query: "질문" });
  });

  it("**아는 것만 남기고 간다**", () => {
    expect(planFrom({ kind: "account", topics: ["balance", "전체회원"] }, "질문"))
      .toEqual({ act: "account", topics: ["balance"] });
  });

  it("**모르는 kind 는 설명서로 돌린다**", () => {
    expect(planFrom({ kind: "남의계정읽기" }, "질문")).toEqual({ act: "search", query: "질문" });
  });

  it.each([
    ["없는 것", undefined],
    ["빈 것", {}],
    ["글자", "account"],
  ])("**%s 면 설명서로 돌린다**", (_이름, decision) => {
    expect(planFrom(decision, "질문")).toEqual({ act: "search", query: "질문" });
  });
});

/**
 * **근거가 없으면 답을 안 쓴다.** 모델에게 묻지도 않는다 — 물어 놓고
 * 「모른다고 답해라」라고 부탁하는 것보다 안 부르는 편이 확실하다.
 */
describe("근거가 쓸 만한가", () => {
  it("**조각이 있으면 쓸 만하다**", () => {
    expect(hasUsableEvidence([조각("이용 안내 · 크레딧", "내용")])).toBe(true);
  });

  it("**조각이 없으면 안 쓴다**", () => {
    expect(hasUsableEvidence([])).toBe(false);
  });

  it("**모를 때 하는 말에 문의 길이 들어 있다**", () => {
    expect(NO_EVIDENCE).toContain("문의");
    expect(NO_EVIDENCE, "모르는데 아는 척한다").toContain("알지 못합니다");
  });

  it("**사람에게 넘길 때도 문의 길을 알려 준다**", () => {
    expect(HANDOFF).toContain("문의");
  });
});

/**
 * **출처를 보여 준다**(설계 §6.2). 틀렸을 때 사용자가 바로 안다.
 */
describe("출처", () => {
  it("**글에 박아 둔 주소를 꺼낸다**", () => {
    const 것 = sourcesFrom([조각("이용 안내 · 크레딧과 모델", "[이용 안내 · 크레딧과 모델] (/guide/credits)\n본문")]);

    expect(것).toEqual([{ name: "이용 안내 · 크레딧과 모델", href: "/guide/credits" }]);
  });

  it("**같은 문서는 한 번만 보여 준다**", () => {
    const 것 = sourcesFrom([
      조각("이용 안내 · 크레딧", "[x] (/guide/credits)\n앞 조각"),
      조각("이용 안내 · 크레딧", "[x] (/guide/credits)\n뒤 조각"),
    ]);

    expect(것).toHaveLength(1);
  });

  it("**주소가 없으면 빈 채로 둔다** — 지어내지 않는다", () => {
    const 것 = sourcesFrom([조각("어디선가", "주소가 없는 글")]);

    expect(것[0]?.href).toBe("");
  });

  /**
   * **내 계정 사실에는 출처를 안 붙인다.** 설명서에서 온 것이 아니므로,
   * 붙이면 「내 크레딧 70장」에 엉뚱한 문서가 근거처럼 달린다.
   */
  it("**설명서 답에만 출처를 붙인다**", () => {
    expect(showsSources({ act: "search", query: "x" })).toBe(true);
    expect(showsSources({ act: "account", topics: ["balance"] })).toBe(false);
    expect(showsSources({ act: "talk" })).toBe(false);
    expect(showsSources({ act: "handoff" })).toBe(false);
  });
});

describe("근거를 모델에게 줄 모양", () => {
  it("**조각마다 번호를 붙인다**", () => {
    const 글 = evidenceBlock([조각("가", "첫 내용"), 조각("나", "둘째 내용")]);

    expect(글).toContain("[1] 가");
    expect(글).toContain("[2] 나");
  });

  it("**내용이 그대로 들어간다**", () => {
    expect(evidenceBlock([조각("가", "이미지 1장 = 1크레딧")])).toContain("1크레딧");
  });
});
