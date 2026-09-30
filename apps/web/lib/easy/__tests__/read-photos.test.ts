import { describe, expect, it } from "vitest";
import { readEasyPhotos } from "../read-photos";

/**
 * **기획이 쓰는 그 기계로 읽는다**(설계 §2-3). 새로 만들면 두 벌이 되고 하나는
 * 곧 낡는다. 여기서 재는 것은 「읽을 수 있는 것만 읽고, 못 읽은 것은 비운다」다.
 */

const 읽은것 = {
  people: ["가운데 — 흰 셔츠"], staging: "회색 벽 앞", hasText: false,
  typeInteraction: null, dominantColor: "", accentColor: "", note: "",
};

function 가짜눈(실패할주소 = "") {
  const 본주소: string[] = [];
  return {
    본주소,
    read: async (input: { prompt: string; imageUrls: string[] }) => {
      본주소.push(...input.imageUrls);
      if (input.imageUrls[0] === 실패할주소) throw new Error("못 읽음");
      return 읽은것;
    },
  };
}

describe("사진 읽기", () => {
  it("사진마다 설명을 돌려준다", async () => {
    const 눈 = 가짜눈();
    const 설명 = await readEasyPhotos([{ id: "a", url: "https://x.test/a.png" }], 눈);

    expect(설명.a).toContain("사람 1명");
    expect(눈.본주소).toEqual(["https://x.test/a.png"]);
  });

  it("주소가 없는 사진은 읽지 않고 비운다", async () => {
    const 눈 = 가짜눈();
    const 설명 = await readEasyPhotos([{ id: "a", url: null }, { id: "b", url: "https://x.test/b.png" }], 눈);

    expect(Object.keys(설명)).toEqual(["b"]);
  });

  it("실패한 사진은 비우고 나머지는 읽는다", async () => {
    const 눈 = 가짜눈("https://x.test/a.png");
    const 설명 = await readEasyPhotos(
      [{ id: "a", url: "https://x.test/a.png" }, { id: "b", url: "https://x.test/b.png" }], 눈);

    expect(Object.keys(설명)).toEqual(["b"]);
  });

  /**
   * **한 장씩 부르되 동시에 부른다**(2026-09-30 실측 — 한 장 15초, 세 장 36초).
   * 한 부름에 여러 장을 주면 사람과 연출이 섞이므로 부름은 한 장씩이다.
   */
  it("사진마다 따로, 동시에 읽는다", async () => {
    let 지금 = 0;
    let 가장많이 = 0;
    const 부름: string[][] = [];
    const 눈 = {
      read: async (input: { prompt: string; imageUrls: string[] }) => {
        부름.push(input.imageUrls);
        지금 += 1;
        가장많이 = Math.max(가장많이, 지금);
        await new Promise((resolve) => setTimeout(resolve, 5));
        지금 -= 1;
        return 읽은것;
      },
    };
    const 설명 = await readEasyPhotos(
      [{ id: "a", url: "https://x.test/a.png" }, { id: "b", url: "https://x.test/b.png" }], 눈);

    expect(부름.every((urls) => urls.length === 1)).toBe(true);
    expect(가장많이).toBe(2);
    expect(Object.keys(설명).sort()).toEqual(["a", "b"]);
  });

  /** 읽을 것이 없으면 눈을 만들지도 않는다 — 열쇠가 없는 곳에서도 안 터진다. */
  it("읽을 것이 없으면 아무것도 안 부른다", async () => {
    expect(await readEasyPhotos([])).toEqual({});
  });
});
