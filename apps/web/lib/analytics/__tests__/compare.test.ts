import { describe, expect, it } from "vitest";
import { canCompare, change, changeText, previousWindowEnd, trackingNote, windowStart } from "../compare";

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

describe("windowStart", () => {
  it("days=7: 끝 시각의 한국 날짜에서 6일 앞 0시(한국)", () => {
    expect(windowStart(7, new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-09-29T15:00:00.000Z");
  });
  it("한국 0시 직후는 한국 날짜가 넘어간 쪽으로 센다", () => {
    expect(windowStart(1, new Date("2026-10-05T15:00:01Z")).toISOString()).toBe("2026-10-05T15:00:00.000Z");
  });
  it("days=30", () => {
    expect(windowStart(30, new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-09-06T15:00:00.000Z");
  });
});

describe("canCompare", () => {
  const now = new Date("2026-10-06T03:00:00Z");
  it("앞선 창 첫날 0시 전에 기록이 시작됐으면 견준다", () => {
    expect(canCompare(7, now, new Date("2026-09-22T15:00:00Z"))).toBe(true);
    expect(canCompare(7, now, new Date("2026-09-01T00:00:00Z"))).toBe(true);
  });
  it("앞선 창이 기록 시작 전에 걸치면 안 견준다", () => {
    expect(canCompare(7, now, new Date("2026-09-22T15:00:01Z"))).toBe(false);
    expect(canCompare(30, now, new Date("2026-09-22T15:00:00Z"))).toBe(false);
  });
  it("기록 시작을 모르면 안 견준다", () => expect(canCompare(7, now, null)).toBe(false));
});

describe("trackingNote", () => {
  it("기록 시작일(한국 날짜)과 기간을 말한다", () => {
    expect(trackingNote(7, new Date("2026-10-05T15:30:00Z"))).toBe("방문 기록이 10/06에 시작돼, 앞선 7일과 견줄 자료가 아직 모자랍니다.");
  });
  it("기록이 없으면 그렇게 말한다", () => expect(trackingNote(30, null)).toBe("아직 방문 기록이 없습니다."));
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
