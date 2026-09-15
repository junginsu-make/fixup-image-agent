import { describe, expect, it } from "vitest";
import {
  SET_ROLE_LABEL,
  canAttachSet,
  defaultPickedSet,
  orderedSetItems,
  setPickSummary,
  toggleSetItem,
} from "../set-pick";
import type { SetItemLike } from "../set-pick";

/**
 * 묶음 세트는 **자리까지 함께** 들고 있다(표지·속지·엔딩).
 *
 * 전에는 「실사/녹색 4장」이라는 단추 하나뿐이라 안에 무엇이 들었는지 알 수
 * 없었다(2026-09-15 사용자 보고). 이제 펼쳐 보고 골라 넣는다.
 */

const 네장: SetItemLike[] = [
  { referenceImageId: "a", role: "cover" },
  { referenceImageId: "b", role: "body" },
  { referenceImageId: "c", role: "body" },
  { referenceImageId: "d", role: "ending" },
];

describe("처음 켜져 있는 장", () => {
  /**
   * 캐릭터와 반대다. 캐릭터는 여러 장을 보내면 얼굴이 절충될 수 있어 정면만
   * 켜지만, 세트는 **한 벌로 쓰라고** 만들어 둔 것이라 통째로가 기본이다.
   */
  it("전부 켜진다", () => {
    expect(defaultPickedSet(네장)).toEqual(["a", "b", "c", "d"]);
  });

  it("빈 세트는 아무것도 안 켜진다", () => {
    expect(defaultPickedSet([])).toEqual([]);
  });
});

describe("켜고 끄기", () => {
  it("이번에 안 쓸 장은 뺄 수 있다", () => {
    expect(toggleSetItem(["a", "b", "c", "d"], "c", 네장)).toEqual(["a", "b", "d"]);
  });

  it("다시 누르면 돌아온다", () => {
    expect(toggleSetItem(["a", "b"], "c", 네장)).toEqual(["a", "b", "c"]);
  });

  /** 차례가 사람마다 다르면 같은 선택에 다른 결과가 나온다. */
  it("뺐다 넣어도 원래 차례로 돌아간다", () => {
    const 뺀뒤 = toggleSetItem(["a", "b", "c", "d"], "a", 네장);
    expect(toggleSetItem(뺀뒤, "a", 네장)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("붙일 수 있는가", () => {
  it("하나도 안 고르면 못 붙인다", () => {
    expect(canAttachSet([])).toBe(false);
    expect(canAttachSet(["a"])).toBe(true);
  });
});

describe("고른 것 한 줄", () => {
  /** 고른 수만 적으면 뺀 장이 있다는 것을 모른 채 넘어간다. */
  it("분모를 함께 적는다", () => {
    expect(setPickSummary(["a", "b"], 네장)).toBe("4장 중 2장");
  });

  it("안 골랐으면 그렇다고 적는다", () => {
    expect(setPickSummary([], 네장)).toContain("없음");
  });
});

describe("자리 차례", () => {
  /** 저장된 차례를 그대로 쓰면 엔딩이 맨 앞에 서기도 한다. */
  it("표지 · 속지 · 엔딩 차례로 세운다", () => {
    const 뒤섞임: SetItemLike[] = [
      { referenceImageId: "d", role: "ending" },
      { referenceImageId: "b", role: "body" },
      { referenceImageId: "a", role: "cover" },
    ];

    expect(orderedSetItems(뒤섞임).map((item) => item.referenceImageId)).toEqual(["a", "b", "d"]);
  });

  it("같은 자리끼리는 넣은 차례를 지킨다", () => {
    expect(orderedSetItems(네장).map((item) => item.referenceImageId)).toEqual(["a", "b", "c", "d"]);
  });

  it("자리마다 이름이 있다", () => {
    expect(SET_ROLE_LABEL.cover).toBe("표지");
    expect(SET_ROLE_LABEL.body).toBe("속지");
    expect(SET_ROLE_LABEL.ending).toBe("엔딩");
  });
});
