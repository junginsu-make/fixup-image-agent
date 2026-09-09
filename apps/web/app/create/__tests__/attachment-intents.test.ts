import { describe, expect, it } from "vitest";
import { intentsOrUndefined, visibleIntents } from "../attachment-intents";

/**
 * 안 붙어 있는 자리의 지시가 새어 나가면 안 된다.
 *
 * 적어 두고 그림을 지우면 화면에서는 사라지지만 상태에는 남는다. 카드뉴스에서
 * 같은 자리를 겪었다.
 */

const 다붙음 = { person: true, style: true };
const 아무것도없음 = { person: false, style: false };

describe("붙어 있는 자리만 남는다", () => {
  it("다 붙어 있으면 다 남는다", () => {
    expect(
      visibleIntents({ anchor: "라벨 그대로", person: "안경", style: "색만" }, 다붙음),
    ).toEqual({ anchor: "라벨 그대로", person: "안경", style: "색만" });
  });

  it("레퍼런스를 지우면 레퍼런스에 적은 말은 안 간다", () => {
    expect(
      visibleIntents({ anchor: "라벨 그대로", style: "색만" }, { person: false, style: false }),
    ).toEqual({ anchor: "라벨 그대로" });
  });

  it("인물을 지우면 인물에 적은 말은 안 간다", () => {
    expect(
      visibleIntents({ person: "안경", style: "색만" }, { person: false, style: true }),
    ).toEqual({ style: "색만" });
  });

  it("제품은 1단계 필수라 항상 남는다", () => {
    expect(visibleIntents({ anchor: "라벨 그대로" }, 아무것도없음)).toEqual({
      anchor: "라벨 그대로",
    });
  });
});

describe("공백은 적은 것이 아니다", () => {
  it("공백만 있으면 지운다", () => {
    expect(visibleIntents({ anchor: "   ", style: "\n\t" }, 다붙음)).toEqual({});
  });

  it("앞뒤 공백은 털어서 보낸다", () => {
    expect(visibleIntents({ style: "  색만 가져와  " }, 다붙음)).toEqual({ style: "색만 가져와" });
  });
});

describe("보낼 것이 없으면 아예 안 보낸다", () => {
  it("빈 객체가 아니라 undefined 다 — 빈 객체는 「적었다」로 읽힌다", () => {
    expect(intentsOrUndefined({}, 다붙음)).toBeUndefined();
    expect(intentsOrUndefined({ style: "  " }, 다붙음)).toBeUndefined();
    expect(intentsOrUndefined({ style: "색만" }, { person: true, style: false })).toBeUndefined();
  });

  it("하나라도 있으면 보낸다", () => {
    expect(intentsOrUndefined({ style: "색만" }, 다붙음)).toEqual({ style: "색만" });
  });
});
