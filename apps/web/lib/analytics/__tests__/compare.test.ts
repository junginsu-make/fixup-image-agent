import { describe, expect, it } from "vitest";
import { change, changeText, previousWindowEnd } from "../compare";

describe("previousWindowEnd", () => {
  it("days=7: 7일 전 같은 시각", () => {
    expect(previousWindowEnd(7, new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-09-29T03:00:00.000Z");
  });
  it("days=1: 정확히 24시간 전", () => {
    expect(previousWindowEnd(1, new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-10-05T03:00:00.000Z");
  });
  it("days=30", () => {
    expect(previousWindowEnd(30, new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-09-06T03:00:00.000Z");
  });
  it("한국 0시 직후(UTC 15:00:01)도 같은 시각을 지킨다", () => {
    expect(previousWindowEnd(7, new Date("2026-10-05T15:00:01Z")).toISOString()).toBe("2026-09-28T15:00:01.000Z");
  });
});

describe("change", () => {
  it("previous null 이면 none", () => expect(change(5, null)).toEqual({ kind: "none" }));
  it("0 에서 0 은 same 0", () => expect(change(0, 0)).toEqual({ kind: "same", percent: 0 }));
  it("0 에서 늘면 new", () => expect(change(3, 0)).toEqual({ kind: "new" }));
  it("늘면 up", () => expect(change(112, 100)).toEqual({ kind: "up", percent: 12 }));
  it("줄면 down", () => expect(change(92, 100)).toEqual({ kind: "down", percent: 8 }));
  it("같으면 same 0", () => expect(change(10, 10)).toEqual({ kind: "same", percent: 0 }));
  it("반올림 결과가 0 이면 same", () => expect(change(1001, 1000)).toEqual({ kind: "same", percent: 0 }));
  it("전부 사라지면 down 100", () => expect(change(0, 4)).toEqual({ kind: "down", percent: 100 }));
});

describe("changeText", () => {
  it("글자로도 알린다", () => {
    expect(changeText({ kind: "up", percent: 12 })).toBe("▲ 12%");
    expect(changeText({ kind: "down", percent: 8 })).toBe("▼ 8%");
    expect(changeText({ kind: "same", percent: 0 })).toBe("변화 없음");
    expect(changeText({ kind: "new" })).toBe("새로 생김");
    expect(changeText({ kind: "none" })).toBe("");
  });
});
