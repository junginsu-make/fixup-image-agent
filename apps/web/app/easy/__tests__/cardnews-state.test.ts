import { describe, expect, it } from "vitest";
import {
  cardResults, cardnewsJob, generatingProjects, jobsToRegister, latestCardnewsRow, newestFirst, referenceAnswer,
  openTool, redoCostLabel, startedDespiteError,
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
      .toEqual([{ id: "r1:1", url: "a", group: "r1" }]);
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

describe("결과 칸 차례 (2026-09-30 실제 생성)", () => {
  /** 새것이 위(1단계 사용자 결정)는 지키고, 카드뉴스 한 벌 안은 1번부터 읽힌다. 전에는 8번이 맨 위였다. */
  it("묶음은 새것이 위, 묶음 안은 앞 장부터", () => {
    const items = [
      { id: "poster" }, { id: "r1:1", group: "r1" }, { id: "r1:2", group: "r1" }, { id: "last" },
    ];
    expect(newestFirst(items).map(({ item, at }) => [item.id, at])).toEqual([
      ["last", 3], ["r1:1", 1], ["r1:2", 2], ["poster", 0],
    ]);
  });
});

describe("「이대로 만들기」 답을 못 받았을 때 (미뤄 둔 것 3)", () => {
  /** 서버는 시작했는데 답이 화면에 안 닿으면 원고 그대로 멈춰 있었다. */
  it("다시 읽은 작업이 원고 단계를 지났으면 시작한 것으로 본다", () => {
    expect(startedDespiteError("generating")).toBe(true);
    expect(startedDespiteError("ready")).toBe(true);
  });

  it("아직 원고 단계거나 읽지 못했으면 실패로 본다", () => {
    expect(startedDespiteError("copy_ready")).toBe(false);
    expect(startedDespiteError(undefined)).toBe(false);
  });
});

describe("장 도구 (3단계 §4)", () => {
  it("같은 장 같은 도구를 다시 누르면 닫고, 다른 것을 누르면 바꾼다", () => {
    const 고치기 = { rowId: "r", index: 2, mode: "edit" as const };
    expect(openTool(null, 고치기)).toEqual(고치기);
    expect(openTool(고치기, 고치기)).toBeNull();
    expect(openTool(고치기, { ...고치기, mode: "redo" })).toEqual({ ...고치기, mode: "redo" });
    expect(openTool(고치기, { ...고치기, index: 3 })).toEqual({ ...고치기, index: 3 });
  });

  it("말로 연 확인 줄은 같은 장이어도 닫지 않고 바라는 점을 바꾼다", () => {
    const 확인 = { rowId: "r", index: 2, mode: "redo" as const, note: "글자 크게" };
    expect(openTool(확인, { ...확인, note: "더 밝게" }, { keep: true })).toEqual({ ...확인, note: "더 밝게" });
  });

  it("다시 만들기 값은 그 장 하나로 센다", () => {
    const 보기 = { options: { ratio: "4:5", modelId: "gpt-image-2.5-flare" }, cards: [{ index: 1 }, { index: 2 }] } as never;
    expect(redoCostLabel(보기, 2, "image-v2")).toBe("약 1크레딧");
    expect(redoCostLabel(보기, 2, "cost-v1")).toMatch(/^약 \d+장$/);
  });
});
