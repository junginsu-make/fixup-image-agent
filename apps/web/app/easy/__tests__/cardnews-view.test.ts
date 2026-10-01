import { describe, expect, it } from "vitest";
import { cardnewsView, draftFailureMessage } from "../cardnews-view";

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
    expect(view.cards[1]).toEqual({ index: 2, role: "body", headline: "속지", body: "본문", status: "done", url: "https://x.test/2.png", hasImage: true });
  });

  it("원고가 없으면 까닭을 모은다", () => {
    const view = cardnewsView(작업({ data: { source: { kind: "youtube", url: "u" }, attachments: [], flow: { planningIssues: ["자막이 없습니다"], copyIssues: [], cards: [] } } }), "image-v2");
    expect(view.cards).toEqual([]);
    expect(view.issues).toEqual(["자막이 없습니다"]);
  });

  /** 설계 §9: 만드는 도중 실패하면 실패한 장을 적는다(독립 리뷰). */
  it("실패한 장 번호를 모은다", () => {
    const 실패 = 작업({
      status: "ready",
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: { planningIssues: [], copyIssues: [], cards: [
          { index: 1, role: "cover", copy: { headline: "a" }, status: "done" },
          { index: 2, role: "body", copy: { headline: "b" }, status: "failed" },
          { index: 3, role: "ending", copy: { headline: "c" }, status: "failed" },
        ] },
      },
    });
    expect(cardnewsView(실패, "image-v2").failed).toEqual([2, 3]);
    expect(cardnewsView(작업(), "image-v2").failed).toEqual([]);
  });

  /**
   * 그림에는 강조 문구 · 각주도 찍힌다(2026-09-30 실제 생성). 원고에서 안 보이면 사용자가
   * 확인하지 못한 글이 그림에 나간다.
   */
  it("강조 문구 · 각주도 원고에 보인다", () => {
    const 칸 = 작업({
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: { planningIssues: [], copyIssues: [], cards: [
          { index: 1, role: "cover", copy: { headline: "h", accent: "강조", footnote: "각주" }, status: "pending" },
          { index: 2, role: "body", copy: { headline: "h2", accent: "", footnote: "" }, status: "pending" },
        ] },
      },
    });
    const view = cardnewsView(칸, "image-v2");
    expect(view.cards[0]).toMatchObject({ accent: "강조", footnote: "각주" });
    expect(view.cards[1]).not.toHaveProperty("accent");
    expect(view.cards[1]).not.toHaveProperty("footnote");
  });

  /** 자동 검수가 확인을 권한 장(2026-09-30 실제 생성에서 8장 중 3장). */
  it("검수가 확인을 권한 장 번호를 모은다", () => {
    const 검수 = 작업({
      status: "ready",
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: { planningIssues: [], copyIssues: [], cards: [
          { index: 1, role: "cover", copy: { headline: "a" }, status: "done" },
          { index: 3, role: "body", copy: { headline: "c" }, status: "review_required" },
        ] },
      },
    });
    expect(cardnewsView(검수, "image-v2").review).toEqual([3]);
  });
});

describe("원고를 못 썼을 때의 말", () => {
  it("장수 계산 실패는 쉬운 말로", () => {
    expect(draftFailureMessage(["주 모델 기획 실패: AI가 고른 8장과 실제 자리 합계 9장이 다릅니다.", "OpenAI 예비 기획도 실패했습니다: …"]))
      .toBe("원고를 쓰다가 장수 계산이 어긋났습니다. 다시 보내 주시면 한 번 더 씁니다.");
  });

  it("다른 까닭은 그대로 전한다, 까닭이 없으면 내용을 못 가져왔다고", () => {
    expect(draftFailureMessage(["자막이 없습니다"])).toBe("원고를 쓰지 못했습니다. 자막이 없습니다");
    expect(draftFailureMessage([])).toBe("원고를 쓰지 못했습니다. 내용을 가져오지 못했습니다.");
  });
});

describe("만든 작업 보기 (3단계)", () => {
  it("만든 작업 · 장마다 그림 유무 · 게시글", () => {
    const 만든 = 작업({
      status: "copy_ready",
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: {
          planningIssues: [], copyIssues: [],
          caption: { hook: "h", body: "b", hashtags: [], firstComment: "" },
          cards: [
            { index: 1, role: "cover", copy: { headline: "a" }, status: "done", assetUrl: "u1" },
            { index: 2, role: "body", copy: { headline: "b" }, status: "pending" },
          ],
        },
      },
    });
    const view = cardnewsView(만든, "image-v2");
    expect(view.made).toBe(true);
    expect(view.cards.map((card) => card.hasImage)).toEqual([true, false]);
    expect(view.caption?.hook).toBe("h");
    expect(cardnewsView(작업(), "image-v2").made).toBe(true);
  });

  it("그림이 하나도 없는 원고는 만든 작업이 아니다", () => {
    const 원고 = 작업({
      data: {
        source: { kind: "question", question: "q" }, attachments: [],
        flow: { planningIssues: [], copyIssues: [], cards: [{ index: 1, role: "cover", copy: { headline: "a" }, status: "pending" }] },
      },
    });
    expect(cardnewsView(원고, "image-v2").made).toBe(false);
  });
});
