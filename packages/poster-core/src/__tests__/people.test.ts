import { describe, expect, it } from "vitest";
import { buildPeoplePrompt, readPeople } from "../people";

/**
 * 지킬 사람의 사진에서 **누가 있는지**를 읽는다.
 *
 * 전에는 기획이 사람을 볼 방법이 아예 없었다. 문법 읽기는 「어떻게 보이나」만
 * 읽고 「따라 만들기」 그림에만 돈다 — 지킬 사람의 사진은 아무도 안 봤다.
 * 그래서 인물 묘사가 「1번 사진에 등장하는 사람들(흰색 티셔츠 착용)」 한 줄로
 * 끝났고, 요약에 없는 안경이 몇 번을 돌려도 안 나왔다(2026-09-08 실측).
 */

const SOURCE = [{ id: "a", title: "단체 사진", url: "https://x/a.png" }];

describe("무엇을 읽으라고 하나", () => {
  const prompt = buildPeoplePrompt();

  it("왼쪽부터 한 명씩 적게 한다", () => {
    // 한 문단으로 뭉치면 기획이 다시 요약해 원래 문제로 돌아간다.
    expect(prompt).toContain("왼쪽부터 한 명씩");
    expect(prompt).toContain("한 사람에 한 줄");
  });

  it("안경을 이름으로 부른다 — 그것이 사라진 자리다", () => {
    // **묻는 항목으로 있어야 한다.** 「안경 하나가 다른 사람을 만듭니다」라는
    // 당부만 남고 묻는 줄이 사라져도 `toContain("안경")` 은 통과한다 — 실제로
    // 그 변이가 안 잡혔다.
    expect(prompt).toContain("얼굴에 걸친 것 — 안경·선글라스가 있으면 반드시");
    expect(prompt).toContain("안경 하나가 다른 사람을 만듭니다");
  });

  it("작은 것을 낱낱이 부른다", () => {
    for (const item of ["모자", "시계", "프린트"]) {
      expect(prompt, `${item} 를 물어야 한다`).toContain(item);
    }
  });

  it("**지어내지 말라고 못 박는다**", () => {
    // 안 보이는 것을 채우면 그림이 사진과 달라진다 — 고치려던 것이 반대로 된다.
    expect(prompt).toContain("안 보이는 것은 지어내지 마세요");
    expect(prompt).toContain("보이지 않는 것은 짐작하지 않습니다");
  });
});

describe("사람 읽기", () => {
  it("읽은 줄을 그대로 담는다", async () => {
    const reader = { read: async () => ({ people: ["왼쪽 첫째 · 선글라스", "둘째 · 모자"] }) };
    const result = await readPeople(SOURCE, reader);
    expect(result.people.a).toEqual(["왼쪽 첫째 · 선글라스", "둘째 · 모자"]);
    expect(result.issues).toEqual([]);
  });

  it("한 장씩 따로 읽는다 — 함께 주면 사람을 뒤섞는다", async () => {
    const seen: string[][] = [];
    const reader = { read: async (input: { imageUrls: string[] }) => {
      seen.push(input.imageUrls);
      return { people: ["한 명"] };
    } };
    await readPeople([...SOURCE, { id: "b", title: "둘째", url: "https://x/b.png" }], reader);
    expect(seen).toEqual([["https://x/a.png"], ["https://x/b.png"]]);
  });

  it("**실패해도 안 던진다** — 나머지는 계속한다", async () => {
    let call = 0;
    const reader = { read: async () => {
      call += 1;
      if (call === 1) throw new Error("네트워크");
      return { people: ["둘째 사진의 사람"] };
    } };
    const result = await readPeople(
      [...SOURCE, { id: "b", title: "둘째", url: "https://x/b.png" }],
      reader,
    );
    expect(result.people.a).toBeUndefined();
    expect(result.people.b).toEqual(["둘째 사진의 사람"]);
    expect(result.issues[0]).toContain("단체 사진");
  });

  it("모양이 틀리면 그 장만 비운다", async () => {
    const result = await readPeople(SOURCE, { read: async () => ({ 사람: "한 명" }) });
    expect(result.people).toEqual({});
    expect(result.issues).toHaveLength(1);
  });

  it("사람이 없으면 담지 않는다 — 빈 목록은 없는 것과 같다", async () => {
    const result = await readPeople(SOURCE, { read: async () => ({ people: [] }) });
    expect(result.people).toEqual({});
    expect(result.issues).toEqual([]);
  });

  it("빈 줄은 걸러진다", async () => {
    const result = await readPeople(SOURCE, { read: async () => ({ people: ["  ", "실제 사람"] }) });
    // 빈 줄이 섞이면 스키마가 통째로 거부한다 — 반쪽짜리 목록보다 안전하다.
    expect(result.people.a).toBeUndefined();
  });
});
