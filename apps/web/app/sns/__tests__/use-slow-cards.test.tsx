import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlowCardLike } from "../slow-card";
import { useSlowCards } from "../use-slow-cards";

/** 시계가 돌면서 3분이 지난 카드를 찾아내는가(2026-10-07 Task 6). 판단 자체는 `slow-card.test.ts`. */
const T0 = Date.parse("2026-10-07T08:00:00.000Z");

function Probe({ cards }: { cards: SlowCardLike[] }) {
  return <span>{useSlowCards(cards).join(",")}</span>;
}

let view: ReactTestRenderer;
const shown = () => view.root.findByType("span").props.children as string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  act(() => view.unmount());
  vi.useRealTimers();
});

describe("useSlowCards", () => {
  it("보낸 지 3분이 지나면 시계가 돌아 알아챈다", () => {
    act(() => { view = create(<Probe cards={[{ index: 1, status: "generating", submittedAt: T0 }]} />); });
    expect(shown()).toBe("");
    act(() => { vi.advanceTimersByTime(3 * 60_000); });
    expect(shown()).toBe("1");
  });

  it("보낸 시각이 없으면 처음 본 때부터 재고, 같은 모양으로 다시 받아도 처음부터 다시 재지 않는다", () => {
    act(() => { view = create(<Probe cards={[{ index: 2, status: "generating" }]} />); });
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    act(() => { view.update(<Probe cards={[{ index: 2, status: "generating" }]} />); });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(shown()).toBe("2");
  });

  it("다 만들면 안내가 사라진다", () => {
    act(() => { view = create(<Probe cards={[{ index: 1, status: "generating", submittedAt: T0 - 5 * 60_000 }]} />); });
    expect(shown()).toBe("1");
    act(() => { view.update(<Probe cards={[{ index: 1, status: "done", submittedAt: T0 - 5 * 60_000 }]} />); });
    expect(shown()).toBe("");
  });
});
