import { beforeEach, describe, expect, it, vi } from "vitest";
import { putHandoff, takeHandoff, hasHandoff, peekHandoff } from "../handoff";

function fakeSession() {
  const box: Record<string, string> = {};
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => box[key] ?? null,
    setItem: (key: string, value: string) => { box[key] = value; },
    removeItem: (key: string) => { delete box[key]; },
  });
  return box;
}

beforeEach(() => { fakeSession(); });

describe("글을 넘긴다", () => {
  it("넣은 것을 한 번 꺼낸다", () => {
    putHandoff({ title: "세럼", text: "본문입니다" });
    expect(takeHandoff()).toMatchObject({ title: "세럼", text: "본문입니다" });
    expect(takeHandoff()).toBeNull();
  });
});

describe("꺼내지 않고 들여다본다", () => {
  it("들여다봐도 짐이 남아 있다", () => {
    // 화면을 어느 모드로 열지 정하려면 내용을 봐야 하는데, 그때 꺼내 버리면
    // 정작 글을 채울 쪽이 빈손이 된다.
    putHandoff({ title: "세럼", text: "본문입니다" });
    expect(peekHandoff()?.text).toBe("본문입니다");
    expect(takeHandoff()?.text).toBe("본문입니다");
    expect(peekHandoff()).toBeNull();
  });

  it("짐이 없으면 null", () => {
    expect(peekHandoff()).toBeNull();
  });
});

describe("그림도 넘긴다", () => {
  it("라이브러리에서 고른 그림이 도구까지 따라간다", () => {
    // 글만 넘기면 "이 그림으로 만들기"를 눌러도 도구에서 다시 골라야 한다.
    putHandoff({
      title: "데일리 수분 세럼",
      text: "",
      images: [{ id: "img-1", title: "제품 사진", url: "https://x/a.png", assetPath: "u/references/a.png" }],
    });
    const taken = takeHandoff();
    expect(taken?.images).toEqual([
      { id: "img-1", title: "제품 사진", url: "https://x/a.png", assetPath: "u/references/a.png" },
    ]);
  });

  it("그림만 넘겨도 된다. 글이 비어도 짐이다", () => {
    // 라이브러리의 그림에는 본문이 없다. 글이 있어야만 짐으로 치면 그림을
    // 아무리 골라도 도구에 아무것도 안 들어간다.
    putHandoff({ title: "제품 사진", text: "", images: [{ id: "a", title: "t", url: "u", assetPath: "p" }] });
    expect(hasHandoff()).toBe(true);
    expect(takeHandoff()?.images).toHaveLength(1);
  });

  it("묶음 세트는 카드 자리까지 실어 보낸다", () => {
    // 세트는 표지·속지·엔딩을 이미 정해 둔 한 벌이다. 자리를 안 실으면
    // 도구에서 다시 정해야 하고, 그러면 세트를 만든 뜻이 없다.
    putHandoff({
      title: "브랜드 기본 세트",
      text: "",
      images: [
        { id: "a", title: "표지", url: "u1", assetPath: "p1", slot: "cover" },
        { id: "b", title: "속지", url: "u2", assetPath: "p2", slot: "body" },
      ],
    });
    expect(takeHandoff()?.images?.map((image) => image.slot)).toEqual(["cover", "body"]);
  });

  it("모르는 자리는 버린다", () => {
    sessionStorage.setItem("fixup:handoff", JSON.stringify({
      title: "t", text: "", images: [{ id: "a", title: "t", url: "u", assetPath: "p", slot: "표지" }],
    }));
    expect(takeHandoff()?.images?.[0]?.slot).toBeUndefined();
  });

  it("그림이 없으면 images 를 비워 돌려준다", () => {
    putHandoff({ title: "세럼", text: "본문" });
    expect(takeHandoff()?.images).toEqual([]);
  });

  it("모양이 아닌 그림은 버린다", () => {
    // 옛 판이 남아 있거나 사용자가 개발자 도구로 건드렸을 수 있다.
    sessionStorage.setItem("fixup:handoff", JSON.stringify({
      title: "t", text: "", images: [{ id: "ok", title: "t", url: "u", assetPath: "p" }, { id: 3 }, "글자"],
    }));
    expect(takeHandoff()?.images).toEqual([{ id: "ok", title: "t", url: "u", assetPath: "p" }]);
  });
});
