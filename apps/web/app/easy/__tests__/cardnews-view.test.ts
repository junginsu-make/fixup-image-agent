import { describe, expect, it } from "vitest";
import { cardnewsView } from "../cardnews-view";

const 작업 = (over: Record<string, unknown> = {}) => ({
  id: "p1", status: "copy_ready", ratio: "4:5", language: "ko", modelId: "gpt-image-2.5-flare",
  cardCountMode: "auto", toneNote: "",
  data: {
    source: { kind: "question" as const, question: "q" }, attachments: [], look: "auto",
    flow: {
      planningIssues: [], copyIssues: [],
      cards: [
        { index: 1, role: "cover", kind: "generated", copy: { headline: "표지 글" }, status: "pending" },
        { index: 2, role: "body", kind: "generated", copy: { headline: "속지", body: "본문" }, status: "done", assetUrl: "https://x.test/2.png" },
      ],
    },
  },
  ...over,
});

describe("원고 보기", () => {
  it("원고 · 조건 · 값 · 무엇으로 썼나", () => {
    const view = cardnewsView(작업(), "image-v2");
    expect(view).toMatchObject({
      projectId: "p1", status: "copy_ready", sourceLabel: "인터넷에서 찾은 내용으로 썼어요",
      cost: { units: 2, label: "약 2크레딧" }, done: 1, total: 2,
      options: { ratio: "4:5", count: "auto", language: "ko", look: "auto" },
    });
    expect(view.cards[1]).toEqual({ index: 2, role: "body", headline: "속지", body: "본문", status: "done", url: "https://x.test/2.png" });
  });

  it("원고가 없으면 까닭을 모은다", () => {
    const view = cardnewsView(작업({ data: { source: { kind: "youtube", url: "u" }, attachments: [], flow: { planningIssues: ["자막이 없습니다"], copyIssues: [], cards: [] } } }), "image-v2");
    expect(view.cards).toEqual([]);
    expect(view.issues).toEqual(["자막이 없습니다"]);
  });
});
