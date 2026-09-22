import { describe, expect, it } from "vitest";
import { WORK_FILTERS, countByOrigin, filterWorks, originLabel, originOf, workFilters } from "../work-filter";

/**
 * **라이브러리 작업물 — 어떤 기능으로 만들었나로 거르기** (2026-09-22 사용자 요청).
 *
 * 「쉽게/다양하게/카드뉴스/캐릭터/광고소재/상세페이지/리디자인」. 쉽게와 다양하게는 같은
 * 포스터 작업으로 저장된다. 쉽게 대화가 자기가 만든 작업을 가리켜 두므로(`easy_messages.work_id`)
 * 그것으로 가른다.
 */
const work = (over: { id?: string; tool: "sns" | "poster" | "create" | "redesign"; origin?: "character" }) => ({ id: "w1", ...over });

describe("어느 기능인가", () => {
  it("쉽게 대화가 가리키는 포스터 작업은 쉽게", () => {
    expect(originOf(work({ tool: "poster", id: "p1" }), new Set(["p1"]))).toBe("easy");
  });

  it("그 밖의 포스터 작업은 다양하게", () => {
    expect(originOf(work({ tool: "poster", id: "p2" }), new Set(["p1"]))).toBe("poster");
  });

  it("카드뉴스·상세페이지·리디자인은 도구 그대로", () => {
    expect(originOf(work({ tool: "sns" }), new Set())).toBe("sns");
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
    expect(filterWorks(works, "character", easy).map((entry) => entry.id)).toEqual(["d"]);
  });

  /** 캐릭터 결과는 캐릭터 탭에도 있다. 전체에 넣으면 두 곳에 같은 것이 보인다. */
  it("전체에는 캐릭터 결과를 넣지 않는다", () => {
    expect(filterWorks(works, "all", easy).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("버튼마다 개수를 센다", () => {
    const counts = countByOrigin(works, easy);
    expect(counts.all).toBe(3);
    expect(counts.easy).toBe(1);
    expect(counts.poster).toBe(1);
    expect(counts.sns).toBe(1);
    expect(counts.character).toBe(1);
    expect(counts.ad).toBe(0);
  });
});

describe("버튼", () => {
  it("사용자가 말한 순서다", () => {
    expect(WORK_FILTERS.map((filter) => filter.label)).toEqual(["전체", "쉽게", "다양하게", "카드뉴스", "캐릭터", "광고소재", "상세페이지", "리디자인"]);
  });

  /** 광고소재 결과는 지금 라이브러리에 저장되지 않는다. 눌러서 늘 비면 고장으로 보인다. */
  it("광고소재는 저장되기 전까지 눌리지 않고 까닭을 말한다", () => {
    const ad = WORK_FILTERS.find((filter) => filter.id === "ad")!;
    expect(ad.unavailable).toContain("라이브러리에 저장되지 않습니다");
  });
});

describe("쉽게 목록을 못 읽었을 때", () => {
  /** 그대로 두면 쉽게 작업이 전부 「다양하게」로 들어가 틀린 것을 보여 준다. */
  it("쉽게·다양하게만 눌리지 않고 나머지는 그대로", () => {
    const filters = workFilters(false);
    const blocked = filters.filter((filter) => filter.unavailable).map((filter) => filter.id);
    expect(blocked.sort()).toEqual(["ad", "easy", "poster"]);
    expect(workFilters(true)).toBe(WORK_FILTERS);
  });
});

describe("카드 이름표", () => {
  it("거르기 단추와 같은 말이다", () => {
    expect(originLabel("easy")).toBe("쉽게");
    expect(originLabel("poster")).toBe("다양하게");
    expect(originLabel("create")).toBe("상세페이지");
  });
});
