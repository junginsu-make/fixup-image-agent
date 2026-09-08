import { describe, expect, it } from "vitest";
import { ATTACHMENT_ROLE_LABEL } from "@fixup/shared";
import { planReferences, restoreAttachments, roleOf } from "../attachment-restore";

/**
 * 이 규칙이 라우트 파일 두 곳에 나뉘어 있어서 시험이 못 붙었다. 옮기고 나서
 * 처음 재는 것이라, **먼저 지금 동작이 무엇인지부터 못 박는다.**
 */

const DATA = {
  attachmentOrder: ["a", "b", "c"],
  preservedIds: ["b", "c"],
  personIds: ["c"],
};

const URLS = { a: "a.png", b: "b.png", c: "c.png" };

describe("역할 판정", () => {
  it("사람을 먼저 본다", () => {
    // `personIds` 는 `preservedIds` 의 부분집합이다. 물건을 먼저 보면 사람이
    // 물건으로 판정되고, 얼굴 지키는 문구 대신 제품 문구가 나간다.
    expect(roleOf(DATA, "c")).toBe("preserve_person");
  });

  it("지킬 것이면 물건", () => {
    expect(roleOf(DATA, "b")).toBe("preserve_product");
  });

  it("나머지는 따라 만들기", () => {
    expect(roleOf(DATA, "a")).toBe("style");
  });

  it("표시가 없으면 전부 따라 만들기", () => {
    expect(roleOf({}, "x")).toBe("style");
  });
});

describe("그림 만들 때 되살리기", () => {
  it("저장된 차례 그대로 준다", () => {
    expect(restoreAttachments(DATA, URLS)).toEqual([
      { url: "a.png", role: "style" },
      { url: "b.png", role: "preserve_product" },
      { url: "c.png", role: "preserve_person" },
    ]);
  });

  it("차례가 없으면 빈 배열 — 부르는 쪽이 옛 목록으로 간다", () => {
    // 옛 작업에는 차례가 저장돼 있지 않다. 여기서 빈 배열을 주면
    // `buildPosterJob` 이 두 목록을 이어 붙인다(지금까지의 동작).
    expect(restoreAttachments({ preservedIds: ["b"] }, URLS)).toEqual([]);
  });

  it("주소가 없는 id 는 뺀다", () => {
    // 라이브러리에서 지운 그림이 차례에는 남아 있을 수 있다.
    expect(restoreAttachments(DATA, { a: "a.png", c: "c.png" })).toEqual([
      { url: "a.png", role: "style" },
      { url: "c.png", role: "preserve_person" },
    ]);
  });

  it("전부 사라졌으면 빈 배열", () => {
    expect(restoreAttachments(DATA, {})).toEqual([]);
  });
});

describe("기획에 넘길 목록", () => {
  const ALL = [
    { id: "a", title: "레퍼런스 A" },
    { id: "b", title: "제품" },
    { id: "c", title: "홍길동 (캐릭터) · 정면" },
  ];

  it("차례대로 번호를 매기고 역할을 붙인다", () => {
    expect(planReferences(DATA, ALL, { a: "밝은 톤" })).toEqual([
      { title: "레퍼런스 A", grammar: "밝은 톤", number: 1, roleLabel: "따라 만들기" },
      { title: "제품", grammar: undefined, number: 2, roleLabel: "제품 그대로 지키기" },
      { title: "홍길동 (캐릭터) · 정면", grammar: undefined, number: 3, roleLabel: "인물 그대로 지키기" },
    ]);
  });

  it("**거른 뒤에 번호를 매긴다** — 구멍을 안 남긴다", () => {
    /**
     * 첨부 하나를 라이브러리에서 지운 뒤 기획을 다시 돌리는 경우다.
     * 매기고 나서 거르면 `1, 3` 이 되어, 기획이 「3번 그림」을 근거로 칸을
     * 채웠을 때 최종 프롬프트에는 3번이 없다.
     */
    const withoutB = ALL.filter((entry) => entry.id !== "b");
    const rows = planReferences(DATA, withoutB, {});
    expect(rows.map((row) => row.number)).toEqual([1, 2]);
    expect(rows.map((row) => row.title)).toEqual(["레퍼런스 A", "홍길동 (캐릭터) · 정면"]);
  });

  it("차례가 없으면 넘겨받은 순서를 쓴다 — 옛 작업", () => {
    /**
     * 그림 만드는 쪽(`restoreAttachments`)은 여기서 빈 배열을 주는데,
     * 이쪽은 목록을 그대로 쓴다. **일부러 다르다.**
     *
     * 기획은 칸을 채우는 일이라 목록을 비우면 첨부를 아예 모르게 된다 —
     * 「첨부한 그림과 겉도는 칸」이라는 원래 문제로 되돌아간다.
     *
     * 부르는 쪽이 `[...따라만들기, ...지키기]` 를 넘기고 옛 작업의 최종
     * 프롬프트도 같은 순서로 이어 붙이므로, 결국 번호가 안 어긋난다.
     */
    const rows = planReferences({ preservedIds: ["b"] }, ALL, {});
    expect(rows.map((row) => row.number)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.roleLabel)).toEqual([
      "따라 만들기", "제품 그대로 지키기", "따라 만들기",
    ]);
  });

  it("제목이 없으면 「레퍼런스」로 부른다", () => {
    expect(planReferences({}, [{ id: "a", title: null }], {})[0]?.title).toBe("레퍼런스");
  });

  it("아무것도 없으면 빈 목록", () => {
    expect(planReferences({}, [], {})).toEqual([]);
  });
});

describe("두 쪽이 같은 번호를 본다", () => {
  it("차례가 있으면 같은 순서다", () => {
    // 이것이 이 기능의 약속이다 — 화면 ①번이 프롬프트 Image 1 이고, 기획도
    // 그 번호로 부른다. 세 곳이 갈리면 「①번을」이라고 쓴 지시가 헛돈다.
    const ALL = [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }];
    const restored = restoreAttachments(DATA, URLS);
    const planned = planReferences(DATA, ALL, {});

    expect(restored.length).toBe(planned.length);
    restored.forEach((attachment, index) => {
      expect(planned[index]!.number).toBe(index + 1);
      // 역할도 같은 것을 가리켜야 한다. **라벨은 `@fixup/shared` 가 갖는다** —
      // 여기 다시 적으면 카드뉴스·상세페이지와 갈린다(설계 §3).
      expect(planned[index]!.roleLabel).toBe(ATTACHMENT_ROLE_LABEL[attachment.role]);
    });
  });

  it("지운 그림이 있어도 둘이 같은 번호를 본다", () => {
    // 앞선 리뷰가 잡은 자리다. 한쪽만 구멍을 남기면 기획이 없는 번호를 가리킨다.
    const ALL = [{ id: "a", title: "A" }, { id: "c", title: "C" }];
    const restored = restoreAttachments(DATA, { a: "a.png", c: "c.png" });
    const planned = planReferences(DATA, ALL, {});

    expect(restored.length).toBe(2);
    expect(planned.map((row) => row.number)).toEqual([1, 2]);
  });
});
