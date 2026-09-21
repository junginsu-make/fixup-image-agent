import { describe, expect, it } from "vitest";
import {
  chosenViews,
  describeCharacterChoice,
  isAutoChoice,
  pickedFrom,
} from "../character-choice";

/**
 * 상세페이지·리디자인은 **그림을 붙이는 게 아니라 이름표를 넘긴다.**
 *
 * 그림은 서버가 생성 시점에 꺼낸다. 그래서 화면이 "지금 무엇이 쓰이는지" 말하지
 * 않으면 사용자는 알 길이 없다 — 예전에는 이름 한 줄뿐이라 넉 장을 만들어 둬도
 * 어느 장이 가는지 몰랐다(2026-09-15 사용자 보고).
 *
 * **화면 밖에서 정한다.** 「자동인가 고른 것인가」를 값으로 못 재면 아무도 안 본다.
 */

const 이름표 = (angle: string) =>
  ({ front: "정면", left_45: "왼쪽 45°", back: "뒷면" }[angle] ?? angle);

const 넉장 = [
  { angle: "front", url: "f.png" },
  { angle: "left_45", url: "l.png" },
  { angle: "back", url: "b.png" },
  { angle: "sheet", url: "s.png" },
];

describe("자동인가", () => {
  /** 빈 배열이 자동이다. 「안 골랐다」와 「자동」은 같은 뜻이다. */
  it("고른 것이 없으면 자동", () => {
    expect(isAutoChoice([])).toBe(true);
    expect(isAutoChoice(["front"])).toBe(false);
  });
});

describe("지금 무엇이 쓰이는지 한 줄", () => {
  /*
    **판정처럼 말하지 않는다**(U-05, 2026-09-19).

    전에는 「섹션에 맞는 장면을 골라 씁니다」라 적고 그 「섹션」을 시험이
    지켰다. 자동은 **낱말 대조**이고, 리디자인에서는 섹션 설명이 없어 언제나
    한 각도로 굳는다 — 거기서는 그 말이 **사실도 아니었다.**
  */
  it("**자동이 무엇으로 고르는지 말한다**", () => {
    const 말 = describeCharacterChoice([], 넉장, 이름표);

    expect(말).toContain("자동");
    expect(말).toContain("낱말");
    // 「섹션에 맞는」은 판정처럼 읽힌다.
    expect(말).not.toContain("맞는 장면");
  });

  /** 「2장」이 아니라 어느 각도인지 말해야 다시 열어 보지 않는다. */
  it("고른 것은 각도 이름으로 말한다", () => {
    expect(describeCharacterChoice(["front", "back"], 넉장, 이름표)).toBe("정면 · 뒷면");
  });

  it("한 장이면 그 한 장만", () => {
    expect(describeCharacterChoice(["left_45"], 넉장, 이름표)).toBe("왼쪽 45°");
  });
});

describe("보여 줄 그림", () => {
  it("고른 각도의 그림만 고른 차례로", () => {
    expect(chosenViews(["back", "front"], 넉장).map((view) => view.url)).toEqual(["b.png", "f.png"]);
  });

  /**
   * 자동일 때도 **무엇이 있는지는** 보여 준다. 어느 장이 갈지는 섹션이 정하므로
   * 고를 수 있는 전부가 후보다.
   */
  it("자동이면 고를 수 있는 전부", () => {
    expect(chosenViews([], 넉장).map((view) => view.angle)).toEqual(["front", "left_45", "back"]);
  });

  /** 「다각도 한 장」은 6컷 격자라 정체성 참조로 못 쓴다. */
  it("다각도 한 장은 안 보여 준다", () => {
    expect(chosenViews(["sheet"], 넉장)).toEqual([]);
  });

  it("없는 각도는 조용히 빠진다", () => {
    expect(chosenViews(["front", "없는것"], 넉장).map((view) => view.angle)).toEqual(["front"]);
  });
});

/**
 * 모달이 주는 것과 화면이 들고 있는 것을 잇는다. 모달은 「고른 각도」를 주는데,
 * **정면 하나만 켠 채로** 「자동」을 누를 수도 있어야 한다.
 */
describe("모달 결과를 화면 상태로", () => {
  it("자동을 누르면 빈 배열", () => {
    expect(pickedFrom({ auto: true, angles: ["front"] })).toEqual([]);
  });

  it("고른 것을 누르면 고른 각도", () => {
    expect(pickedFrom({ auto: false, angles: ["front", "back"] })).toEqual(["front", "back"]);
  });

  /** 하나도 안 고르고 「고른 것」이 눌리면 자동으로 떨어진다. 캐릭터가 사라지면 안 된다. */
  it("고른 것이 없으면 자동으로 떨어진다", () => {
    expect(pickedFrom({ auto: false, angles: [] })).toEqual([]);
  });
});
