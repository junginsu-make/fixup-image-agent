import { describe, expect, it } from "vitest";
import {
  cardResults, cardnewsJob, continuingKind, generatingProjects, latestCardnewsRow, setItemsToAttach,
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
