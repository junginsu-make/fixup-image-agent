import { describe, expect, it } from "vitest";
import { attachMessage, characterIdByTitle, matchAngles } from "../character-attach";
import { characterReferenceTitle } from "../../../lib/character-library";

/**
 * 고른 각도가 **실제로 다 붙는가.**
 *
 * 참고 이미지에는 캐릭터를 가리키는 칸이 없어 제목이 유일한 손잡이다. 제목
 * 규칙이 한쪽만 바뀌면 고른 장이 조용히 사라진다 — 세 장을 골랐는데 두 장만
 * 붙고 아무도 모른다.
 */

const 그림 = (title: string, id = title) => ({ id, title });

const 호랑이 = [
  그림(characterReferenceTitle("호랑이", "front"), "f"),
  그림(characterReferenceTitle("호랑이", "left_45"), "l"),
  그림(characterReferenceTitle("호랑이", "back"), "b"),
  그림("치약 1", "other"),
];

describe("각도를 라이브러리 그림과 짝짓기", () => {
  it("고른 각도를 모두 찾는다", () => {
    const { matched, missing } = matchAngles(호랑이, "호랑이", ["front", "left_45"]);

    expect(matched.map((entry) => entry.image.id)).toEqual(["f", "l"]);
    expect(missing).toEqual([]);
  });

  /** 차례가 사람마다 다르면 같은 선택에 다른 그림이 나온다. */
  it("고른 차례를 그대로 지킨다", () => {
    const { matched } = matchAngles(호랑이, "호랑이", ["back", "front"]);
    expect(matched.map((entry) => entry.angle)).toEqual(["back", "front"]);
  });

  /** 조용히 빠지면 아무도 모른다. */
  it("못 찾은 각도를 따로 알려준다", () => {
    const { matched, missing } = matchAngles(호랑이, "호랑이", ["front", "right_45"]);

    expect(matched).toHaveLength(1);
    expect(missing).toEqual(["right_45"]);
  });

  it("다른 캐릭터의 그림을 가져오지 않는다", () => {
    const 강아지섞임 = [...호랑이, 그림(characterReferenceTitle("강아지", "front"), "dog-f")];
    const { matched } = matchAngles(강아지섞임, "강아지", ["front"]);

    expect(matched.map((entry) => entry.image.id)).toEqual(["dog-f"]);
  });

  /** 사람이 「내 캐릭터」라고 손으로 붙인 이름은 캐릭터가 아니다. */
  it("제목이 비슷한 보통 그림은 안 걸린다", () => {
    const { matched, missing } = matchAngles([그림("호랑이", "plain")], "호랑이", ["front"]);

    expect(matched).toEqual([]);
    expect(missing).toEqual(["front"]);
  });

  it("아무것도 안 고르면 빈 결과다", () => {
    expect(matchAngles(호랑이, "호랑이", [])).toEqual({ matched: [], missing: [] });
  });
});

describe("붙인 뒤 할 말", () => {
  const 이름표 = (angle: string) => ({ front: "정면", back: "뒷모습" }[angle] ?? angle);

  it("다 붙었으면 장수를 적는다", () => {
    expect(attachMessage("호랑이", 3, [])).toContain("3장");
  });

  it("못 찾은 것이 있으면 그것을 이름으로 말한다", () => {
    const 말 = attachMessage("호랑이", 2, ["back"], 이름표);

    expect(말).toContain("2장");
    expect(말).toContain("뒷모습");
  });

  it("하나도 못 찾았으면 못 찾았다고만 말한다", () => {
    const 말 = attachMessage("호랑이", 0, ["front"], 이름표);

    expect(말).toContain("찾지 못했습니다");
    expect(말).not.toContain("0장");
  });

  /** 이미 다 들어 있는 것과 못 찾은 것은 다른 일이다. */
  it("이미 들어 있으면 그렇다고 말한다", () => {
    expect(attachMessage("호랑이", 0, [])).toContain("이미");
  });
});

/**
 * 첨부를 객체로 안 들고 역할만 id 로 들고 다니는 화면(포스터)도 **「이 넷은 한
 * 사람」을 알아야** 「인물은 한 명만」에 안 걸린다.
 */
describe("그림에서 캐릭터 되짚기", () => {
  const 목록 = [
    { id: "tiger", name: "호랑이", views: [{ angle: "front" }, { angle: "back" }] },
    { id: "dog", name: "강아지", views: [{ angle: "front" }] },
  ];

  it("각도마다 캐릭터를 찾아 준다", () => {
    const byTitle = characterIdByTitle(목록);

    expect(byTitle.get(characterReferenceTitle("호랑이", "front"))).toBe("tiger");
    expect(byTitle.get(characterReferenceTitle("호랑이", "back"))).toBe("tiger");
    expect(byTitle.get(characterReferenceTitle("강아지", "front"))).toBe("dog");
  });

  it("캐릭터가 아닌 그림은 없다", () => {
    expect(characterIdByTitle(목록).get("치약 1")).toBeUndefined();
  });

  /** 이름이 같으면 제목도 같다. 먼저 만든 쪽으로 붙는다 — 조용히 뒤집히지 않는다. */
  it("이름이 겹치면 먼저 것이 이긴다", () => {
    const 겹침 = [
      { id: "first", name: "호랑이", views: [{ angle: "front" }] },
      { id: "second", name: "호랑이", views: [{ angle: "front" }] },
    ];

    expect(characterIdByTitle(겹침).get(characterReferenceTitle("호랑이", "front"))).toBe("first");
  });
});
