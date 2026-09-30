import { describe, expect, it } from "vitest";
import {
  cardResults, cardnewsJob, continuingKind, generatingProjects, jobsToRegister, latestCardnewsRow, referenceAnswer,
  setItemsToAttach,
} from "../cardnews-state";

const 보기 = (status: string, cards: Array<{ index: number; url?: string; status?: string }>) => ({
  projectId: "p", status, cards: cards.map((c) => ({ role: "body", headline: "h", status: c.status ?? "done", ...c })),
  issues: [], options: { ratio: "4:5", count: "auto", language: "ko", modelId: "m", look: "auto" },
  sourceLabel: "", cost: { units: 1, label: "" }, done: 0, total: cards.length,
}) as never;

describe("카드뉴스 화면 상태", () => {
  /** Review Focus 1 */
  it("마지막 원고에만 단추", () => {
    const messages = [{ id: "r1", role: "image" }, { id: "u", role: "user" }, { id: "r2", role: "image" }] as never;
    expect(latestCardnewsRow(messages, { r1: 보기("copy_ready", []), r2: 보기("copy_ready", []) })).toBe("r2");
  });

  it("포스터 그림 줄은 원고로 안 센다", () => {
    const messages = [{ id: "r1", role: "image" }, { id: "poster", role: "image" }] as never;
    expect(latestCardnewsRow(messages, { r1: 보기("copy_ready", []) })).toBe("r1");
  });

  it("다 만든 카드를 결과 칸에", () => {
    expect(cardResults([{ id: "r1", role: "image" }] as never, { r1: 보기("ready", [{ index: 1, url: "a" }, { index: 2 }]) }))
      .toEqual([{ id: "r1:1", url: "a" }]);
  });

  it("만드는 중인 작업", () => {
    expect(generatingProjects({ r1: 보기("generating", []), r2: 보기("ready", []) })).toEqual(["p"]);
  });

  /** Review Focus 3 */
  it("세트 그림 중 없는 것은 세고, 있는 것만 붙인다", () => {
    const set = { items: [{ referenceImageId: "a", role: "cover" }, { referenceImageId: "z", role: "body" }] };
    expect(setItemsToAttach(set, [{ id: "a", url: "u", title: "A" }])).toEqual({
      attach: [{ id: "a", url: "u", title: "A" }], slots: [{ id: "a", role: "cover" }], missing: 1,
    });
  });

  it("세트에 같은 그림이 두 자리로 있으면 한 번만 붙이고 자리는 둘 다", () => {
    const set = { items: [{ referenceImageId: "a", role: "cover" }, { referenceImageId: "a", role: "ending" }] };
    expect(setItemsToAttach(set, [{ id: "a", url: "u", title: null }])).toEqual({
      attach: [{ id: "a", url: "u", title: "레퍼런스" }],
      slots: [{ id: "a", role: "cover" }, { id: "a", role: "ending" }],
      missing: 0,
    });
  });

  /** Review Focus 2 */
  it("셸 등록 주소는 그 대화", () => {
    expect(cardnewsJob("p", "c1", "건강")).toMatchObject({ id: "sns:p", tool: "sns", href: "/easy/c1", poll: { url: "/api/sns/projects/p/status" } });
  });
});

describe("고른 갈래가 이어진다 (2단계 §4)", () => {
  it("다시 보낼 때 정한 갈래가 먼저", () => {
    expect(continuingKind({ explicit: "image", pending: "cardnews", continuing: true })).toBe("image");
  });

  it("비율 · 사진 물음에 답할 때는 앞서 고른 갈래를 잇는다", () => {
    expect(continuingKind({ pending: "image", continuing: true })).toBe("image");
  });

  it("카드뉴스 사진 물음에 답하면 카드뉴스로 보낸다", () => {
    expect(continuingKind({ continuing: true, photoMode: "cardnews" })).toBe("cardnews");
  });

  it("새로 친 말에는 앞서 고른 갈래를 안 붙인다", () => {
    expect(continuingKind({ pending: "cardnews", continuing: false, photoMode: "cardnews" })).toBeUndefined();
  });
});

describe("레퍼런스 요청의 답 (2단계 §5-3, 독립 리뷰 2)", () => {
  it("요청에 답해 붙인 그림은 분위기 참고로 확정하고, 세트의 자리를 함께 보낸다", () => {
    expect(referenceAnswer({
      added: ["a", "b", "a"], attachedIds: ["p", "a", "b"],
      slots: [{ id: "a", role: "cover" }, { id: "b", role: "ending" }],
    })).toEqual({
      photoRoles: [{ id: "a", role: "style" }, { id: "b", role: "style" }],
      photoSlots: [{ id: "a", role: "cover" }, { id: "b", role: "ending" }],
    });
  });

  it("요청 전부터 붙어 있던 그림은 판단에 맡긴다, 뺀 그림은 안 보낸다", () => {
    expect(referenceAnswer({ added: ["a", "gone"], attachedIds: ["p", "a"], slots: [{ id: "gone", role: "cover" }] }))
      .toEqual({ photoRoles: [{ id: "a", role: "style" }], photoSlots: [] });
  });
});

describe("셸 등록 (2단계 §8, 독립 리뷰 3)", () => {
  const 우리것 = { id: "sns:p", href: "/easy/c1" };

  it("셸에 없으면 등록한다", () => {
    expect(jobsToRegister(["p"], [], "c1")).toEqual(["p"]);
  });

  it("같은 작업이 이 대화 주소로 있으면 다시 안 한다", () => {
    expect(jobsToRegister(["p"], [우리것], "c1")).toEqual([]);
  });

  /** 카드뉴스 화면에 들렀다 오면 주소가 `/sns/p` 로 바뀌어 있다. 그대로 두면 셸과 이 화면이 같이 부른다. */
  it("같은 작업이 다른 주소로 있으면 이 대화 주소로 다시 건다", () => {
    expect(jobsToRegister(["p"], [{ id: "sns:p", href: "/sns/p" }], "c1")).toEqual(["p"]);
  });
});
