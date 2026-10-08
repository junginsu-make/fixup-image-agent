import { describe, expect, it } from "vitest";
import { LIBRARY_VIEWS, WORK_FILTERS, countByOrigin, filterWorks, originLabel, originOf, workFilters } from "../work-filter";

/**
 * **라이브러리 작업물 — 어떤 기능으로 만들었나로 거르기** (2026-09-22 사용자 요청).
 *
 * 「쉽게/다양하게/카드뉴스/광고소재/상세페이지/리디자인」. 쉽게와 다양하게는 같은
 * 포스터 작업으로 저장된다. 쉽게 대화가 자기가 만든 작업을 가리켜 두므로(`easy_messages.work_id`)
 * 그것으로 가른다.
 *
 * 2026-10-08: 위 탭과 한 줄로 합쳤다. 「캐릭터」는 캐릭터 화면 단추 하나다.
 */
const work = (over: {
  id?: string; tool: "sns" | "poster" | "create" | "redesign" | "ad"; origin?: "character"; imageCount?: number; cover?: string | null;
}) => ({ id: "w1", imageCount: 1, cover: null, ...over });

describe("어느 기능인가", () => {
  it("쉽게 대화가 가리키는 포스터 작업은 쉽게", () => {
    expect(originOf(work({ tool: "poster", id: "p1" }), new Set(["p1"]))).toBe("easy");
  });

  it("그 밖의 포스터 작업은 다양하게", () => {
    expect(originOf(work({ tool: "poster", id: "p2" }), new Set(["p1"]))).toBe("poster");
  });

  it("카드뉴스·광고소재·상세페이지·리디자인은 도구 그대로", () => {
    expect(originOf(work({ tool: "sns" }), new Set())).toBe("sns");
    expect(originOf(work({ tool: "ad" }), new Set())).toBe("ad");
    expect(originOf(work({ tool: "create" }), new Set())).toBe("create");
    expect(originOf(work({ tool: "redesign" }), new Set())).toBe("redesign");
  });

  it("캐릭터 만들기로 만든 것은 캐릭터", () => {
    expect(originOf(work({ tool: "create", origin: "character" }), new Set())).toBe("character");
  });
});

describe("거르기", () => {
  const works = [
    work({ id: "a", tool: "poster" }),
    work({ id: "b", tool: "poster" }),
    work({ id: "c", tool: "sns" }),
    work({ id: "d", tool: "create", origin: "character" }),
  ];
  const easy = new Set(["a"]);

  it("고른 기능으로 만든 것만", () => {
    expect(filterWorks(works, "easy", easy).map((entry) => entry.id)).toEqual(["a"]);
    expect(filterWorks(works, "poster", easy).map((entry) => entry.id)).toEqual(["b"]);
    expect(filterWorks(works, "create", easy).map((entry) => entry.id)).toEqual([]);
  });

  /**
   * 예전에 라이브러리에 저장된 캐릭터 결과(운영 1건, 원본 캐릭터는 이미 지워짐). 「캐릭터」 단추는
   * 이제 캐릭터 화면이라, 전체에서 빼면 어디서도 안 보인다.
   */
  it("전체에는 예전 캐릭터 결과도 넣는다", () => {
    expect(filterWorks(works, "all", easy).map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("버튼마다 개수를 센다", () => {
    const counts = countByOrigin(works, easy);
    expect(counts).toEqual({ all: 4, easy: 1, poster: 1, sns: 1, ad: 0, create: 0, redesign: 0 });
  });
});

/**
 * **그림 없는 작업은 안 보인다**(2026-10-08 사용자 결정). 그림을 만들기 전에 멈춘 작업이라
 * 크레딧이 나가지 않았다 — 운영 13건 모두 0크레딧. 크레딧 사용은 설정 › 사용 기록에 남는다.
 */
describe("그림 없는 작업", () => {
  const works = [
    work({ id: "made", tool: "poster" }),
    work({ id: "blank-poster", tool: "poster", imageCount: 0 }),
    work({ id: "blank-sns", tool: "sns", imageCount: 0 }),
    work({ id: "blank-doc", tool: "create", imageCount: 0, cover: null }),
    // 낱장을 미뤄 받는 계정 보관분은 장수가 0 이어도 표지가 있으면 그림이 있는 것이다.
    work({ id: "cover-only", tool: "create", imageCount: 0, cover: "https://cover" }),
  ];

  it("어느 거르기에서도 빠진다", () => {
    expect(filterWorks(works, "all", new Set()).map((entry) => entry.id)).toEqual(["made", "cover-only"]);
    expect(filterWorks(works, "sns", new Set())).toEqual([]);
  });

  it("개수에도 안 든다", () => {
    const counts = countByOrigin(works, new Set());
    expect(counts.all).toBe(2);
    expect(counts.poster).toBe(1);
    expect(counts.sns).toBe(0);
    expect(counts.create).toBe(1);
  });
});

describe("버튼", () => {
  it("작업물 거르기는 사용자가 말한 순서다", () => {
    expect(WORK_FILTERS.map((filter) => filter.label)).toEqual(["전체", "쉽게", "다양하게", "카드뉴스", "광고소재", "상세페이지", "리디자인"]);
  });

  /** 위 탭(작업물·참고 이미지·캐릭터)과 아래 거르기를 한 줄로 합쳤다(2026-10-08 사용자 요청). */
  it("한 줄 — 작업물 거르기 뒤에 캐릭터·참고 이미지", () => {
    expect(LIBRARY_VIEWS.map((view) => view.label)).toEqual(["전체", "쉽게", "다양하게", "카드뉴스", "광고소재", "상세페이지", "리디자인", "캐릭터", "참고 이미지"]);
    expect(LIBRARY_VIEWS.filter((view) => view.label === "캐릭터")).toHaveLength(1);
  });

  /** 광고 결과를 라이브러리에 한 묶음으로 저장하게 됐다(2026-10-08). 더는 막지 않는다. */
  it("광고소재는 눌린다", () => {
    const ad = WORK_FILTERS.find((filter) => filter.id === "ad")!;
    expect(ad.unavailable).toBeUndefined();
  });

  it("광고소재 결과만 거른다", () => {
    const works = [work({ id: "a", tool: "ad" }), work({ id: "s", tool: "sns" })];
    expect(filterWorks(works, "ad", new Set()).map((entry) => entry.id)).toEqual(["a"]);
    expect(countByOrigin(works, new Set()).ad).toBe(1);
  });
});

describe("쉽게 목록을 못 읽었을 때", () => {
  /** 그대로 두면 쉽게 작업이 전부 「다양하게」로 들어가 틀린 것을 보여 준다. */
  it("쉽게·다양하게만 눌리지 않고 나머지는 그대로", () => {
    const filters = workFilters(false);
    const blocked = filters.filter((filter) => filter.unavailable).map((filter) => filter.id);
    expect(blocked.sort()).toEqual(["easy", "poster"]);
    expect(workFilters(true)).toBe(WORK_FILTERS);
  });
});

describe("카드 이름표", () => {
  it("거르기 단추와 같은 말이다", () => {
    expect(originLabel("easy")).toBe("쉽게");
    expect(originLabel("poster")).toBe("다양하게");
    expect(originLabel("create")).toBe("상세페이지");
  });

  it("예전 캐릭터 결과는 「캐릭터」", () => {
    expect(originLabel("character")).toBe("캐릭터");
  });
});
