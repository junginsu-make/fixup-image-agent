import { describe, expect, it } from "vitest";
import { createLimiter, nextWindow } from "../rate-limit";

describe("nextWindow", () => {
  it("창 안에서는 센 수를 하나 올린 새 값을 준다(원래 값은 그대로)", () => {
    const prev = { startedAt: 1_000, count: 3 };
    const next = nextWindow(prev, 1_500, 60_000);
    expect(next).toEqual({ startedAt: 1_000, count: 4 });
    expect(prev).toEqual({ startedAt: 1_000, count: 3 });
  });
  it("창이 지나면 1 부터 다시", () => {
    expect(nextWindow({ startedAt: 0, count: 99 }, 60_000, 60_000)).toEqual({ startedAt: 60_000, count: 1 });
    expect(nextWindow(undefined, 5, 60_000)).toEqual({ startedAt: 5, count: 1 });
  });
});

describe("createLimiter", () => {
  it("한도까지 받고 넘으면 거절, 다음 창에서 다시 받는다", () => {
    const allow = createLimiter({ limit: 2, windowMs: 1_000, maxKeys: 10 });
    expect([allow("a", 0), allow("a", 1), allow("a", 2)]).toEqual([true, true, false]);
    expect(allow("b", 2)).toBe(true);
    expect(allow("a", 1_000)).toBe(true);
  });
  it("열쇠가 너무 많아지면 비우고 계속 받는다 — 메모리가 끝없이 늘지 않는다", () => {
    const allow = createLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    allow("a", 0);
    allow("b", 0);
    expect(allow("a", 0)).toBe(true); // 비운 뒤라 새 창
  });
});
