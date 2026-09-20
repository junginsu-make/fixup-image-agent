import { describe, expect, it } from "vitest";
import { extractJsonCandidate } from "./pdp.response-parse";

/**
 * **잘린 답 하나가 12초를 태웠다**(D-5).
 *
 * 모델이 답을 끝까지 못 쓰면 닫히지 않은 JSON 이 온다. 그때 쓰던 추출기는
 * **끝에서부터 한 글자씩 줄여 가며 매번 `JSON.parse` 를 다시 돌렸다.**
 * 길이의 제곱이다.
 *
 * 실측(2026-09-20, 닫히지 않은 설계도):
 *
 *   10KB   125ms
 *   25KB   627ms
 *   50KB   2,274ms
 *   100KB  12,100ms
 *
 * 기획 응답 상한이 32,768토큰이라 100KB 짜리 잘린 답은 드물지 않다. 그 12초는
 * **아무것도 못 찾고** 끝난다. 그동안 Node 는 한 요청에 묶여 다른 사용자의
 * 요청도 못 받는다.
 *
 * 설계 §14.4(D-5): 「동일 입력 계측, **선형 parser 로** 수정」.
 */

describe("감싸인 JSON 을 꺼낸다", () => {
  it.each([
    ["앞에 말이 붙었다", '설명입니다 {"a":1}', '{"a":1}'],
    ["뒤에 말이 붙었다", '{"a":1} 이상입니다', '{"a":1}'],
    ["배열도 꺼낸다", "여기: [1,2,3]", "[1,2,3]"],
    ["중첩", '{"a":{"b":[1,{"c":2}]}}', '{"a":{"b":[1,{"c":2}]}}'],
  ])("%s", (_label, input, expected) => {
    expect(extractJsonCandidate(input)).toBe(expected);
  });

  /**
   * **글자 안의 괄호에 속지 않는다.** 이것이 깊이만 세는 판과 갈리는 자리다.
   */
  it.each([
    ['{"a":"}"}', '{"a":"}"}'],
    ['{"a":"]["}', '{"a":"]["}'],
    ['{"a":"\\""}', '{"a":"\\""}'],
    ['{"a":"\\\\"}', '{"a":"\\\\"}'],
  ])("%s → 그대로 꺼낸다", (input, expected) => {
    expect(extractJsonCandidate(input)).toBe(expected);
  });

  it("**첫 번째 온전한 값을 준다**", () => {
    expect(extractJsonCandidate('{"a":1} {"b":2}')).toBe('{"a":1}');
  });

  it.each([
    ["빈 글자", ""],
    ["괄호가 없다", "그냥 문장입니다"],
    ["안 닫혔다", '{"sections":[{"id":"S1"'],
    ["닫는 것만 있다", '}"a":1}'],
  ])("%s → null", (_label, input) => {
    expect(extractJsonCandidate(input)).toBeNull();
  });

  it("**괄호는 맞는데 JSON 이 아니면 null 이다**", () => {
    // 균형만 보고 돌려주면 부르는 쪽이 `JSON.parse` 에서 터진다.
    expect(extractJsonCandidate("{그냥 글자}")).toBeNull();
  });
});

/**
 * **길이에 비례해야 한다.**
 *
 * 제곱이면 100KB 에서 12초다. 선형이면 밀리초다. 넉넉히 잡아도 옛 판은 절대
 * 못 지나간다 — 옛 판은 25KB 에서 이미 627ms 다.
 */
describe("길이에 비례한다", () => {
  /** 닫히지 않은 설계도. 모델이 상한에 걸리면 정확히 이 꼴이 온다. */
  const 잘린설계도 = (kb: number) => {
    let body = '{"sections":[';
    while (body.length < kb * 1024) {
      body += `{"section_id":"S${body.length}","headline":"${"가".repeat(60)}","prompt_en":"${"a".repeat(200)}"},`;
    }
    return body;
  };

  it("**100KB 짜리 잘린 답을 100ms 안에 포기한다**", () => {
    const input = 잘린설계도(100);
    const 시작 = Date.now();

    expect(extractJsonCandidate(input)).toBeNull();
    expect(Date.now() - 시작).toBeLessThan(100);
  });

  it("**네 배로 길어져도 네 배 안쪽이다** — 제곱이면 열여섯 배다", () => {
    const 잰다 = (kb: number) => {
      const input = 잘린설계도(kb);
      const 시작 = process.hrtime.bigint();
      extractJsonCandidate(input);
      return Number(process.hrtime.bigint() - 시작);
    };

    // 워밍업. 첫 호출은 JIT 때문에 값이 튄다.
    잰다(25);
    const 작은것 = 잰다(25);
    const 큰것 = 잰다(100);

    // 선형이면 4배 안팎이다. 넉넉히 8배까지 봐준다 — 제곱이면 16배다.
    expect(큰것).toBeLessThan(작은것 * 8);
  });
});
