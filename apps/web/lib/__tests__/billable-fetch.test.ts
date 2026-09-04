import { describe, expect, it } from "vitest";
import { billableHeaders } from "../billable-fetch";

/** 서버가 쓰는 것과 같은 모양. `membership/api.ts` 의 검사와 맞춰 둔다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("크레딧 깎는 요청의 헤더", () => {
  it("요청 식별자를 붙인다", () => {
    // 없으면 서버가 예약을 거절한다 — 캐릭터 만들기가 이것 때문에 통째로 막혔다.
    expect(billableHeaders().get("x-idempotency-key")).toMatch(UUID);
  });

  it("서버가 받는 모양이다", () => {
    // 아무 문자열이나 되는 게 아니다. UUID 4판이어야 통과한다.
    for (let i = 0; i < 20; i += 1) {
      expect(billableHeaders().get("x-idempotency-key")).toMatch(UUID);
    }
  });

  it("매번 다른 값이다", () => {
    // 같은 값을 재사용하면 두 번째 요청이 첫 번째 결과로 응답된다.
    const seen = new Set(Array.from({ length: 50 }, () => billableHeaders().get("x-idempotency-key")));
    expect(seen.size).toBe(50);
  });

  it("이미 넣어 둔 값은 그대로 둔다", () => {
    // 재시도에서 같은 열쇠를 써야 크레딧이 두 번 깎이지 않는다.
    const fixed = "11111111-1111-4111-8111-111111111111";
    expect(billableHeaders({ "x-idempotency-key": fixed }).get("x-idempotency-key")).toBe(fixed);
  });

  it("content-type 도 같이 붙인다", () => {
    expect(billableHeaders().get("content-type")).toBe("application/json");
  });

  it("다른 헤더를 지우지 않는다", () => {
    const headers = billableHeaders({ "x-trace": "abc" });
    expect(headers.get("x-trace")).toBe("abc");
  });
});
