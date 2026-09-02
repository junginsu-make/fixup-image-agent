import { describe, expect, it } from "vitest";
import { characterReferenceTitle, characterReferenceEntries } from "../character-library";

describe("캐릭터를 라이브러리에 넣을 때의 이름", () => {
  it("무슨 캐릭터의 어느 각도인지 제목만 보고 안다", () => {
    // 라이브러리에는 온갖 그림이 섞인다. 각도만 적으면 누구 것인지 알 수 없다.
    expect(characterReferenceTitle("민수", "front")).toBe("민수 (캐릭터) · 정면");
    expect(characterReferenceTitle("민수", "left")).toBe("민수 (캐릭터) · 좌측");
    expect(characterReferenceTitle("민수", "right")).toBe("민수 (캐릭터) · 우측");
    expect(characterReferenceTitle("민수", "back")).toBe("민수 (캐릭터) · 뒷모습");
  });

  it("모르는 각도가 와도 이름을 만든다", () => {
    expect(characterReferenceTitle("민수", "top")).toBe("민수 (캐릭터) · top");
  });
});

describe("라이브러리에 넣을 목록", () => {
  const views = [
    { angle: "back", base64: "d", mimeType: "image/png" },
    { angle: "front", base64: "a", mimeType: "image/png" },
    { angle: "right", base64: "c", mimeType: "image/webp" },
    { angle: "left", base64: "b", mimeType: "image/png" },
  ];

  it("정면이 맨 앞이다", () => {
    // 목록에서 대표로 보이는 것이 뒷모습이면 누구인지 못 알아본다.
    expect(characterReferenceEntries("민수", views).map((entry) => entry.angle))
      .toEqual(["front", "left", "right", "back"]);
  });

  it("각 장에 이름과 원본을 함께 넘긴다", () => {
    const [first] = characterReferenceEntries("민수", views);
    expect(first).toEqual({
      angle: "front",
      title: "민수 (캐릭터) · 정면",
      base64: "a",
      mimeType: "image/png",
    });
  });

  it("네 각도가 다 들어간다", () => {
    // 일관성 때문에 네 각도로 만든다. 한 장이라도 빠지면 그 이유가 없어진다.
    expect(characterReferenceEntries("민수", views)).toHaveLength(4);
  });

  it("빈 목록이면 아무것도 안 만든다", () => {
    expect(characterReferenceEntries("민수", [])).toEqual([]);
  });
});
