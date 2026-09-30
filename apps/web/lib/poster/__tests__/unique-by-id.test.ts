import { describe, expect, it } from "vitest";
import { uniqueById } from "../unique-by-id";

/** 같은 그림을 두 역할에 붙이면 두 번 읽고 값도 두 번 나갔다(설계 2026-09-30 §2·§3.1). */
describe("같은 그림은 한 번만", () => {
  it("겹치는 id 는 처음 것 하나만 남기고 차례는 그대로 둔다", () => {
    const list = [{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "a", n: 3 }, { id: "c", n: 4 }];
    expect(uniqueById(list)).toEqual([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 4 }]);
  });

  it("받은 목록을 바꾸지 않는다", () => {
    const list = [{ id: "a" }, { id: "a" }];
    uniqueById(list);
    expect(list).toHaveLength(2);
  });

  it("빈 목록이면 빈 목록", () => {
    expect(uniqueById([])).toEqual([]);
  });
});
