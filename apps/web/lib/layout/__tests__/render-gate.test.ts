import { describe, expect, it } from "vitest";
import { PER_USER_LIMIT, RenderBusyError, TOTAL_LIMIT, renderLoad, withRenderSlot } from "../render-gate";

/** 끝날 시점을 시험이 정하는 일. */
function pending<T>() {
  let done!: (value: T) => void;
  const promise = new Promise<T>((resolve) => { done = resolve; });
  return { promise, done };
}

describe("withRenderSlot", () => {
  it("한가할 때는 그냥 통과시킨다", async () => {
    expect(await withRenderSlot("user-1", async () => "그렸다")).toBe("그렸다");
    expect(renderLoad().active).toBe(0);
  });

  it("한 사람이 동시에 둘을 돌리려 하면 거절한다", async () => {
    const first = pending<void>();
    const running = withRenderSlot("user-1", () => first.promise);

    await expect(withRenderSlot("user-1", async () => "둘째")).rejects.toBeInstanceOf(RenderBusyError);

    first.done();
    await running;
    expect(PER_USER_LIMIT).toBe(1);
  });

  it("서로 다른 사람이라도 전체 상한을 넘으면 거절한다", async () => {
    const held = Array.from({ length: TOTAL_LIMIT }, () => pending<void>());
    const running = held.map((entry, offset) => withRenderSlot(`user-${offset}`, () => entry.promise));

    await expect(withRenderSlot("user-late", async () => "늦은 사람")).rejects.toBeInstanceOf(RenderBusyError);

    held.forEach((entry) => entry.done());
    await Promise.all(running);
  });

  it("실패해도 자리를 돌려준다", async () => {
    await expect(withRenderSlot("user-1", async () => { throw new Error("합성 실패"); })).rejects.toThrow("합성 실패");

    expect(renderLoad()).toEqual({ active: 0, users: 0 });
    expect(await withRenderSlot("user-1", async () => "다시 됨")).toBe("다시 됨");
  });
});
