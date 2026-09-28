import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendCsTurns,
  clearCsTurns,
  isCsSessionId,
  readCsTurns,
  resetCsSessionsForTest,
} from "../session";

/**
 * **대화는 하루 산다**(2026-09-23 사용자 결정, 2026-09-28 에 한 시간에서 늘림).
 *
 * > 창을 닫고 1시간까지만 유지하고 지나면 다 리셋 시키세요.
 *
 * 대화도 계정 경계 안이다(설계 §4) — 남의 대화를 불러올 길을 안 만든다.
 */

beforeEach(() => {
  resetCsSessionsForTest();
  vi.useRealTimers();
});

describe("번호를 가린다", () => {
  it("**멀쩡한 번호는 받는다**", () => {
    expect(isCsSessionId("chat-abc12345")).toBe(true);
  });

  it.each([
    ["빈 것", ""],
    ["너무 짧은 것", "abc"],
    ["빗금", "../../etc/passwd"],
    ["공백", "chat 1234"],
    ["숫자", 12345678],
    ["없는 것", undefined],
  ])("**%s 은 안 받는다**", (_이름, value) => {
    expect(isCsSessionId(value)).toBe(false);
  });

  it("**너무 긴 것은 안 받는다**", () => {
    expect(isCsSessionId("a".repeat(65))).toBe(false);
  });
});

describe("이어 붙인다", () => {
  it("**오간 말이 남는다**", () => {
    appendCsTurns("chat-0001", "me", [
      { role: "user", text: "크레딧 얼마 남았어요?" },
      { role: "bot", text: "70장입니다." },
    ]);

    expect(readCsTurns("chat-0001", "me")).toHaveLength(2);
  });

  it("**다음 말이 뒤에 붙는다**", () => {
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "첫 말" }]);
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "둘째 말" }]);

    expect(readCsTurns("chat-0001", "me").map((t) => t.text)).toEqual(["첫 말", "둘째 말"]);
  });

  it("**없는 대화는 빈 목록이다**", () => {
    expect(readCsTurns("chat-9999", "me")).toEqual([]);
  });

  /**
   * **끝없이 자라지 않는다.** 긴 대화를 통째로 프롬프트에 실으면 값이 는다.
   * 최근 말이 맥락에 더 쓸모 있으므로 뒤에서부터 남긴다.
   */
  it("**말이 너무 많으면 앞에서 버린다**", () => {
    for (let i = 0; i < 30; i += 1) {
      appendCsTurns("chat-0001", "me", [{ role: "user", text: `말 ${i}` }]);
    }

    const 남은것 = readCsTurns("chat-0001", "me");
    expect(남은것.length).toBeLessThanOrEqual(20);
    expect(남은것.at(-1)?.text, "최근 말이 안 남았다").toBe("말 29");
  });

  it("**빈 말은 아무것도 안 한다**", () => {
    appendCsTurns("chat-0001", "me", []);

    expect(readCsTurns("chat-0001", "me")).toEqual([]);
  });
});

/**
 * **남의 대화를 못 불러온다**(설계 §4.3).
 */
describe("주인", () => {
  beforeEach(() => {
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "내 말" }]);
  });

  it("**다른 사람이 물으면 빈 목록이다**", () => {
    expect(readCsTurns("chat-0001", "other")).toEqual([]);
  });

  it("**누구인지 모르면 빈 목록이다**", () => {
    expect(readCsTurns("chat-0001", "")).toEqual([]);
  });

  it("**남의 대화에 말을 못 붙인다**", () => {
    appendCsTurns("chat-0001", "other", [{ role: "user", text: "남의 말" }]);

    const 내것 = readCsTurns("chat-0001", "me");
    expect(내것.map((t) => t.text), "남이 내 대화에 끼어들었다").toEqual(["내 말"]);
  });

  it("**남의 대화를 못 지운다**", () => {
    clearCsTurns("chat-0001", "other");

    expect(readCsTurns("chat-0001", "me"), "남이 내 대화를 지웠다").toHaveLength(1);
  });

  it("**내 대화는 내가 지운다**", () => {
    clearCsTurns("chat-0001", "me");

    expect(readCsTurns("chat-0001", "me")).toEqual([]);
  });
});

/**
 * **하루.** 2026-09-28 사용자가 한 시간에서 늘렸다.
 *
 * 화면 쪽과 같은 수여야 한다(`lib/cs/chat-store.ts`). 서버가 먼저 잊으면
 * 화면에는 대화가 보이는데 도우미는 앞의 말을 모른 채 답한다.
 */
describe("하루 뒤 사라진다", () => {
  it("**23시간은 이어진다**", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "내 말" }]);

    vi.setSystemTime(new Date("2026-09-23T23:00:00Z"));
    expect(readCsTurns("chat-0001", "me")).toHaveLength(1);
  });

  /** 한 시간이던 때 사라지던 자리. 이제는 남아야 한다. */
  it("**61분에는 안 사라진다**", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "내 말" }]);

    vi.setSystemTime(new Date("2026-09-23T01:01:00Z"));
    expect(readCsTurns("chat-0001", "me"), "아직 하루가 안 지났는데 버렸다").toHaveLength(1);
  });

  it("**25시간은 빈 창이다**", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "내 말" }]);

    vi.setSystemTime(new Date("2026-09-24T01:00:00Z"));
    expect(readCsTurns("chat-0001", "me")).toEqual([]);
  });

  /**
   * **시계는 말할 때마다 다시 선다.** 하루는 「마지막으로 말한 뒤 하루」다 —
   * 대화하는 중에 끊기면 안 된다.
   */
  it("**말하면 시계가 다시 선다**", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T00:00:00Z"));
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "첫 말" }]);

    vi.setSystemTime(new Date("2026-09-23T20:00:00Z"));
    appendCsTurns("chat-0001", "me", [{ role: "user", text: "둘째 말" }]);

    // 첫 말로부터 28시간, 둘째 말로부터 8시간.
    vi.setSystemTime(new Date("2026-09-24T04:00:00Z"));
    expect(readCsTurns("chat-0001", "me"), "대화하는 중에 끊겼다").toHaveLength(2);
  });

  /**
   * **끝없이 쌓이지 않는다.** 창을 닫고 간 사람들의 대화가 남으면 메모리가
   * 는다.
   */
  it("**너무 많이 쌓이면 오래된 것부터 버린다**", () => {
    for (let i = 0; i < 600; i += 1) {
      appendCsTurns(`chat-${String(i).padStart(6, "0")}`, "me", [{ role: "user", text: "말" }]);
    }

    expect(readCsTurns("chat-000000", "me"), "제일 오래된 것이 남아 있다").toEqual([]);
    expect(readCsTurns("chat-000599", "me"), "방금 한 말이 사라졌다").toHaveLength(1);
  });
});
