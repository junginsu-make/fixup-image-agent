import { describe, expect, it } from "vitest";
import { unwrapStringified } from "../structured";

describe("문자열로 만들어 온 결과 되살리기", () => {
  it("멀쩡한 결과는 그대로 둔다", () => {
    const input = { total: 4, cards: [{ index: 1 }] };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("칸 하나를 문자열로 만들어 오면 되살린다", () => {
    const result = unwrapStringified({ total: 4, cards: '[{"index":1},{"index":2}]' });
    expect((result as { cards: unknown[] }).cards).toHaveLength(2);
  });

  it("결과 전체를 한 칸에 문자열로 넣어 와도 되살린다", () => {
    // 자료가 3,000자를 넘으면 실제로 이렇게 온다.
    const result = unwrapStringified({
      cards: '{"total":4,"cards":[{"index":1},{"index":2},{"index":3}]}',
    });
    expect((result as { total: number }).total).toBe(4);
    expect((result as { cards: unknown[] }).cards).toHaveLength(3);
  });

  it("진짜 문자열은 건드리지 않는다", () => {
    const input = { summary: "문제 없음", decision: "pass" };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("JSON 처럼 생겼지만 깨진 문자열은 그대로 둔다", () => {
    const input = { cards: "{망가진" };
    expect(unwrapStringified(input)).toBe(input);
  });

  it("객체가 아니면 그대로 둔다", () => {
    expect(unwrapStringified("문자열")).toBe("문자열");
    expect(unwrapStringified(null)).toBe(null);
  });

  it("여는 괄호로 시작하지 않는 문자열은 파싱하지 않는다", () => {
    const input = { note: "3,000자를 넘으면 [이런 일]이 생긴다" };
    expect(unwrapStringified(input)).toBe(input);
  });
});
