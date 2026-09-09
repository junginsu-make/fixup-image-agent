import { describe, expect, it } from "vitest";
import { attachedSlotsOf, intentsOrUndefined, visibleIntents } from "../attachment-intents";

/**
 * 안 붙어 있는 자리의 지시가 새어 나가면 안 된다.
 *
 * 적어 두고 그림을 지우면 화면에서는 사라지지만 상태에는 남는다. 카드뉴스에서
 * 같은 자리를 겪었다.
 */

const 다붙음 = { anchor: true, person: true, style: true };
const 아무것도없음 = { anchor: false, person: false, style: false };

describe("붙어 있는 자리만 남는다", () => {
  it("다 붙어 있으면 다 남는다", () => {
    expect(
      visibleIntents({ anchor: "라벨 그대로", person: "안경", style: "색만" }, 다붙음),
    ).toEqual({ anchor: "라벨 그대로", person: "안경", style: "색만" });
  });

  it("레퍼런스를 지우면 레퍼런스에 적은 말은 안 간다", () => {
    expect(
      visibleIntents({ anchor: "라벨 그대로", style: "색만" }, { anchor: true, person: false, style: false }),
    ).toEqual({ anchor: "라벨 그대로" });
  });

  it("인물을 지우면 인물에 적은 말은 안 간다", () => {
    expect(
      visibleIntents({ person: "안경", style: "색만" }, { anchor: true, person: false, style: true }),
    ).toEqual({ style: "색만" });
  });

  it("제품 사진이 없으면 제품에 적은 말도 안 간다", () => {
    expect(visibleIntents({ anchor: "라벨 그대로" }, 아무것도없음)).toEqual({});
  });

  /**
   * 다른 작업을 불러오면 제품이 바뀐다. 앞 제품에 대해 적은 말이 그대로 남으면
   * 새 제품의 보호 문구가 엉뚱한 이유로 풀린다 — 사용자는 편집기 화면에서
   * 그 칸을 볼 수도 없다.
   */
  it("제품이 붙어 있으면 남는다", () => {
    expect(visibleIntents({ anchor: "라벨 그대로" }, 다붙음)).toEqual({ anchor: "라벨 그대로" });
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
    expect(intentsOrUndefined({ style: "색만" }, { anchor: true, person: true, style: false })).toBeUndefined();
  });

  it("하나라도 있으면 보낸다", () => {
    expect(intentsOrUndefined({ style: "색만" }, 다붙음)).toEqual({ style: "색만" });
  });
});

describe("화면 상태에서 붙은 자리를 읽는다", () => {
  const 기본 = {
    preparedImage: null,
    modelImage: null,
    characterId: undefined,
    styleReference: null,
    styleReferenceEnabled: true,
  };

  it("아무것도 없으면 셋 다 거짓", () => {
    expect(attachedSlotsOf(기본)).toEqual({ anchor: false, person: false, style: false });
  });

  it("제품 사진이 있으면 anchor 가 참", () => {
    expect(attachedSlotsOf({ ...기본, preparedImage: { base64: "A" } }).anchor).toBe(true);
  });

  it("인물 사진이나 캐릭터 중 하나만 있어도 person 이 참", () => {
    expect(attachedSlotsOf({ ...기본, modelImage: { base64: "P" } }).person).toBe(true);
    expect(attachedSlotsOf({ ...기본, characterId: "c1" }).person).toBe(true);
  });

  /** 토글을 끄면 그림이 안 가므로 그 그림에 대해 적은 말도 가면 안 된다. */
  it("레퍼런스 토글을 끄면 style 이 거짓", () => {
    expect(attachedSlotsOf({ ...기본, styleReference: { id: "s" } }).style).toBe(true);
    expect(
      attachedSlotsOf({ ...기본, styleReference: { id: "s" }, styleReferenceEnabled: false }).style,
    ).toBe(false);
  });

  it("자리끼리 섞이지 않는다", () => {
    const only = attachedSlotsOf({ ...기본, styleReference: { id: "s" } });
    expect(only).toEqual({ anchor: false, person: false, style: true });
  });
});
