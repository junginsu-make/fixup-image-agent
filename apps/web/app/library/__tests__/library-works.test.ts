import { describe, expect, it } from "vitest";
import {
  isWorkShowcased, libraryCharacterWorks, libraryWorks, showcaseKindOf, TOOL_LABEL,
} from "../library-works";

/**
 * 계정에 보관된 상세페이지·리디자인 작업을 **작업물 탭에 싣는다.**
 *
 * 지금까지 이 탭은 카드뉴스와 포스터만 실었다(`works-tab.tsx` 의 `TOOL_LABEL`
 * 이 둘뿐이었다). 상세페이지로 만든 것은 라이브러리 어디에도 안 보였고 —
 * 「불러오기」 창에서만 보였다 — 그래서 「과정 보기」를 붙일 자리조차 없었다.
 */
const item = {
  id: "item-1",
  title: "흑초 상세페이지",
  tool: "create" as const,
  aspectRatio: "4:5",
  sourceType: "generation" as const,
  imageCount: 5,
  createdAt: "2026-09-16T00:00:00.000Z",
  coverUrl: "https://example.test/cover.png",
  coverThumbUrl: "https://example.test/cover.thumb.webp",
  mine: true,
  ownerEmail: null,
};

describe("libraryWorks", () => {
  it("표지는 사본을 쓴다", () => {
    /*
      목록이 원본을 받으면 한 번에 수십 MB 가 오간다 — 사용자가 「끊긴다」고
      말한 그 증상이다(`works-cover.ts`).
    */
    const [work] = libraryWorks([item]);
    expect(work!.cover).toBe("https://example.test/cover.thumb.webp");
  });

  it("사본이 없는 옛 작업은 원본으로 떨어진다", () => {
    const [work] = libraryWorks([{ ...item, coverThumbUrl: null }]);
    expect(work!.cover).toBe("https://example.test/cover.png");
  });

  it("도구 이름과 설정을 함께 싣는다", () => {
    const [work] = libraryWorks([item]);
    expect(work!.tool).toBe("create");
    expect(work!.settings).toContainEqual(["비율", "4:5"]);
    expect(work!.settings).toContainEqual(["장수", "5장"]);
  });

  it("누르면 라이브러리 쪽 화면으로 간다", () => {
    /*
      도구 화면(`/create`)으로 보내지 않는다. 계정 보관분은 브라우저 초안이
      아니라 **이어서 편집할 수 없다**(`library/page.tsx` 의 주석). 도구로
      보내면 「저장된 작업을 찾지 못했습니다」가 뜬다 — 예전에 실제로 그랬다.
    */
    const [work] = libraryWorks([item]);
    expect(work!.href).toBe("/library/works/item-1");
  });

  it("캐릭터는 싣지 않는다", () => {
    /*
      캐릭터 만들기 결과는 캐릭터 표와 라이브러리 **양쪽에** 저장된다
      (`202607300001_library_source_metadata.sql`). 여기서도 실으면 캐릭터 탭과
      작업물 탭에 같은 것이 두 번 보인다.
    */
    expect(libraryWorks([{ ...item, sourceType: "character" }])).toEqual([]);
  });

  it("그림이 하나도 없는 작업은 싣지 않는다", () => {
    // 표지도 없고 열 것도 없다. 카드만 덩그러니 서면 눌러도 빈 창이 열린다.
    expect(libraryWorks([{ ...item, imageCount: 0, coverUrl: null, coverThumbUrl: null }])).toEqual([]);
  });

  it("낱장은 목록에 싣지 않는다 — 열 때 받는다", () => {
    /*
      한 작업에 스무 장까지 들어간다. 목록에서 전부 서명해 실으면 처음 화면이
      다시 무거워진다. 카드에 필요한 것은 표지뿐이다.
    */
    const [work] = libraryWorks([item]);
    expect(work!.images).toEqual([]);
  });

  it("낱장이 비어도 몇 장인지는 안다", () => {
    /*
      카드 본문을 누르면 그림 뷰어가 열리는데, 그 판단을 `images.length` 로
      하면 낱장을 미뤄 받는 작업은 **영영 뷰어가 안 열린다** — 늘 0장이라
      도구 화면으로 튕긴다.
    */
    const [work] = libraryWorks([item]);
    expect(work!.imageCount).toBe(5);
  });

  it("남의 것인지 서버가 말한 대로 싣는다", () => {
    const [work] = libraryWorks([{ ...item, mine: false, ownerEmail: "someone@example.test" }]);
    expect(work!.mine).toBe(false);
    expect(work!.ownerEmail).toBe("someone@example.test");
  });
});

describe("showcaseKindOf", () => {
  it("상세페이지·리디자인은 갤러리에서 한 갈래다", () => {
    /*
      갤러리의 출처는 `library`·`sns`·`poster` 셋뿐이다
      (`api/showcase/core.ts:10`). 도구 이름을 그대로 보내면 zod 가 거절한다 —
      화면에는 「걸림」이라 떠 있는데 실제로는 안 걸리는 어긋남이 난다.
    */
    expect(showcaseKindOf("create")).toBe("library");
    expect(showcaseKindOf("redesign")).toBe("library");
    expect(showcaseKindOf("sns")).toBe("sns");
    expect(showcaseKindOf("poster")).toBe("poster");
  });
});

describe("TOOL_LABEL", () => {
  it("네 도구에 모두 이름이 있다", () => {
    // 빠지면 카드에 `undefined` 가 그대로 찍힌다.
    expect(Object.keys(TOOL_LABEL).sort()).toEqual(["create", "poster", "redesign", "sns"]);
    for (const label of Object.values(TOOL_LABEL)) expect(label).not.toBe("");
  });
});

/**
 * 카드에 **「첫 화면」 배지**를 언제 다나.
 *
 * 처음에는 낱장을 훑어 판단했다(`work.images.some(...)`). 그런데 계정 보관
 * 작업의 낱장은 설계상 **늘 빈 배열**이라(열 때 받는다) 배지가 영영 안 떴다.
 * 관리자가 걸어 놓고 새로고침하면 안 걸린 줄 알고 또 걸려 한다 — 정작 카드를
 * 열면 갤러리 안쪽은 「걸림」이라고 맞게 뜬다. 화면 두 곳이 다른 답을 냈다
 * (2026-09-16 독립 리뷰).
 */
describe("isWorkShowcased", () => {
  const 걸린것: Parameters<typeof isWorkShowcased>[0] = [
    { sourceKind: "library", sourceId: "item-1" },
    { sourceKind: "sns", sourceId: "sns-1" },
  ];

  it("낱장을 몰라도 이 작업이 걸렸는지는 안다", () => {
    // 몇 번째 장인지는 배지에 안 쓴다. 걸렸나만 알면 된다.
    expect(isWorkShowcased(걸린것, "create", "item-1")).toBe(true);
    expect(isWorkShowcased(걸린것, "redesign", "item-1")).toBe(true);
  });

  it("갈래가 다르면 아니다", () => {
    /*
      id 만 보면 카드뉴스와 상세페이지의 id 가 우연히 같을 때 엉뚱한 카드에
      배지가 붙는다. DB 의 중복 방지 열쇠도 갈래를 함께 본다.
    */
    expect(isWorkShowcased(걸린것, "sns", "item-1")).toBe(false);
    expect(isWorkShowcased(걸린것, "poster", "sns-1")).toBe(false);
  });

  it("안 걸린 작업은 아니다", () => {
    expect(isWorkShowcased(걸린것, "create", "item-2")).toBe(false);
    expect(isWorkShowcased([], "create", "item-1")).toBe(false);
  });
});

/**
 * 캐릭터 만들기 결과 — **「캐릭터」 거르기를 골랐을 때만** 실린다(2026-09-22 사용자 요청).
 * 「전체」에는 여전히 안 싣는다(위 「캐릭터는 싣지 않는다」).
 */
describe("libraryCharacterWorks", () => {
  it("캐릭터 결과만 싣고, 캐릭터라고 표시한다", () => {
    const works = libraryCharacterWorks([item, { ...item, id: "char-1", sourceType: "character" }]);
    expect(works.map((work) => work.id)).toEqual(["char-1"]);
    expect(works[0]!.origin).toBe("character");
    expect(works[0]!.href).toBe("/library/works/char-1");
  });

  it("그림이 없는 캐릭터 결과는 싣지 않는다", () => {
    expect(libraryCharacterWorks([{ ...item, sourceType: "character", imageCount: 0, coverUrl: null, coverThumbUrl: null }])).toEqual([]);
  });

  it("일반 작업에는 캐릭터 표시가 붙지 않는다", () => {
    expect(libraryWorks([item])[0]!.origin).toBeUndefined();
  });
});
