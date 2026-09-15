import { describe, expect, it } from "vitest";
import {
  canAttach,
  defaultPicked,
  frontView,
  pickSummary,
  pickableViews,
  toggleAngle,
} from "../character-pick";

/**
 * 고르는 판단을 **값으로 잰다.**
 *
 * 모달 안에 두면 「정면이 기본으로 켜지는가」·「하나도 안 고르면 어떻게 되는가」를
 * 눈으로만 보게 된다. 이 저장소가 여러 번 데인 자리다.
 */

const 네각도 = [
  { angle: "front", url: "f.png" },
  { angle: "left_45", url: "l.png" },
  { angle: "right_45", url: "r.png" },
  { angle: "back", url: "b.png" },
];

describe("대표 장", () => {
  it("정면을 세운다", () => {
    expect(frontView(네각도)?.angle).toBe("front");
  });

  /** 정면을 지웠거나 옛 자료라 없을 수 있다. 그때도 카드가 비면 안 된다. */
  it("정면이 없으면 그림이 있는 첫 장을 세운다", () => {
    expect(frontView([{ angle: "left_45", url: "l.png" }])?.angle).toBe("left_45");
  });

  it("그림이 하나도 없으면 없다", () => {
    expect(frontView([{ angle: "front", url: null }])).toBeUndefined();
  });
});

describe("고를 수 있는 장", () => {
  /** 아직 안 만든 각도는 붙일 그림이 없다. */
  it("그림이 없는 각도는 뺀다", () => {
    const 섞임 = [{ angle: "front", url: "f.png" }, { angle: "back", url: null }];
    expect(pickableViews(섞임).map((view) => view.angle)).toEqual(["front"]);
  });
});

describe("처음 켜져 있는 장", () => {
  /**
   * 한 번도 안 펼치고 넘어가도 지금까지와 같게 동작해야 한다.
   * 전부 켜 두면 모르고 넉 장을 보내고, 다 꺼 두면 아무것도 안 붙는다.
   */
  it("정면 하나만 켜진다", () => {
    expect(defaultPicked(네각도)).toEqual(["front"]);
  });

  it("정면이 없으면 첫 장이 켜진다", () => {
    expect(defaultPicked([{ angle: "back", url: "b.png" }])).toEqual(["back"]);
  });

  it("그림이 없으면 아무것도 안 켜진다", () => {
    expect(defaultPicked([{ angle: "front", url: null }])).toEqual([]);
  });
});

describe("켜고 끄기", () => {
  it("누르면 켜지고 다시 누르면 꺼진다", () => {
    const 켠뒤 = toggleAngle(["front"], "back", 네각도);
    expect(켠뒤).toContain("back");
    expect(toggleAngle(켠뒤, "back", 네각도)).not.toContain("back");
  });

  /**
   * 차례는 **각도 차례**를 지킨다. 누른 차례로 두면 정면을 나중에 누른 사람은
   * 정면이 뒤로 가고, 모델이 받는 장 차례가 사람마다 달라진다.
   */
  it("누른 차례가 아니라 각도 차례로 남는다", () => {
    const 뒤에서부터 = toggleAngle(toggleAngle([], "back", 네각도), "front", 네각도);
    expect(뒤에서부터).toEqual(["front", "back"]);
  });

  it("넷을 다 켤 수 있다", () => {
    let picked: string[] = [];
    for (const view of 네각도) picked = toggleAngle(picked, view.angle, 네각도);
    expect(picked).toEqual(["front", "left_45", "right_45", "back"]);
  });

  it("마지막 하나까지 끌 수 있다", () => {
    expect(toggleAngle(["front"], "front", 네각도)).toEqual([]);
  });
});

describe("붙일 수 있는가", () => {
  /** 눌러 놓고 아무 일도 안 일어나는 것이 가장 나쁘다. */
  it("하나도 안 고르면 못 붙인다", () => {
    expect(canAttach([])).toBe(false);
    expect(canAttach(["front"])).toBe(true);
  });
});

describe("고른 것 한 줄", () => {
  /** 고른 수만 적으면 이 캐릭터에 장이 더 있다는 것을 모른 채 넘어간다. */
  it("분모를 함께 적는다", () => {
    expect(pickSummary(["front", "back"], 네각도)).toBe("4장 중 2장");
  });

  it("안 골랐으면 그렇다고 적는다", () => {
    expect(pickSummary([], 네각도)).toContain("없음");
  });

  it("그림이 없는 각도는 분모에서 빠진다", () => {
    const 셋 = [...네각도.slice(0, 3), { angle: "back", url: null }];
    expect(pickSummary(["front"], 셋)).toBe("3장 중 1장");
  });
});

/**
 * 「다각도 한 장」은 **각도가 아니다.**
 *
 * 여섯 각도를 3×2 격자로 담은 한 장이다. 이것을 정체성 참조로 보내면 그 격자가
 * 결과물에 그대로 따라 나온다 — `pdp.character.ts` 의 `CHARACTER_SHEET` 머리말이
 * 같은 이유로 이것을 `CHARACTER_ANGLES` 에서 뺐다.
 *
 * 그런데 `/api/characters` 의 `views` 에는 섞여 온다(저장은 되니까). 고르는
 * 자리에서 걸러야 한다.
 */
describe("다각도 한 장은 고를 수 없다", () => {
  const 시트섞임 = [
    { angle: "front", url: "f.png" },
    { angle: "left_45", url: "l.png" },
    { angle: "sheet", url: "s.png" },
  ];

  it("고를 수 있는 장에서 빠진다", () => {
    expect(pickableViews(시트섞임).map((view) => view.angle)).toEqual(["front", "left_45"]);
  });

  it("장수에도 안 센다", () => {
    expect(pickSummary(["front"], 시트섞임)).toBe("2장 중 1장");
  });

  /** 정면이 없어도 격자가 대표로 서면 안 된다. */
  it("대표 장으로도 안 선다", () => {
    expect(frontView([{ angle: "sheet", url: "s.png" }, { angle: "back", url: "b.png" }])?.angle).toBe("back");
  });

  it("격자뿐이면 고를 것이 없다", () => {
    expect(defaultPicked([{ angle: "sheet", url: "s.png" }])).toEqual([]);
  });
});
