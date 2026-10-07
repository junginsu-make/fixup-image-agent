import { describe, expect, it } from "vitest";
import { characterReferenceTitle, characterReferenceEntries } from "../character-library";

describe("캐릭터를 라이브러리에 넣을 때의 이름", () => {
  it("무슨 캐릭터의 어느 각도인지 제목만 보고 안다", () => {
    // 라이브러리에는 온갖 그림이 섞인다. 각도만 적으면 누구 것인지 알 수 없다.
    expect(characterReferenceTitle("민수", "front")).toBe("민수 (캐릭터) · 정면");
    // 옛 이름으로 저장된 줄도 지금 이름표로 부른다 — left 는 45도였다.
    expect(characterReferenceTitle("민수", "left")).toBe("민수 (캐릭터) · 왼쪽 45°");
    expect(characterReferenceTitle("민수", "left_90")).toBe("민수 (캐릭터) · 왼쪽");
    expect(characterReferenceTitle("민수", "right")).toBe("민수 (캐릭터) · 오른쪽 45°");
    expect(characterReferenceTitle("민수", "back")).toBe("민수 (캐릭터) · 뒷면");
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

describe("겹치지 않는 캐릭터 이름", () => {
  /*
    라이브러리는 캐릭터 각도를 **제목(이름)으로만** 찾고 지운다. 이름이 같은 둘이
    생기면 하나를 지울 때 다른 쪽 그림까지 지워진다(2026-10-07 로컬 재현).
  */
  it("겹치지 않으면 그대로", async () => {
    const { uniqueCharacterName } = await import("../character-library");
    expect(uniqueCharacterName("민지", ["민수"])).toBe("민지");
  });

  it("겹치면 (2)·(3) 을 붙인다", async () => {
    const { uniqueCharacterName } = await import("../character-library");
    expect(uniqueCharacterName("민지", ["민지"])).toBe("민지 (2)");
    expect(uniqueCharacterName("민지", ["민지", "민지 (2)"])).toBe("민지 (3)");
  });

  it("앞뒤 빈칸은 같은 이름으로 본다", async () => {
    const { uniqueCharacterName } = await import("../character-library");
    expect(uniqueCharacterName(" 민지 ", ["민지"])).toBe("민지 (2)");
  });

  it("길이 상한 안에서 꼬리표가 남게 본문을 줄인다", async () => {
    const { uniqueCharacterName } = await import("../character-library");
    const long = "가".repeat(80);
    const next = uniqueCharacterName(long, [long], 80);
    expect(next.length).toBeLessThanOrEqual(80);
    expect(next.endsWith(" (2)")).toBe(true);
  });
});
