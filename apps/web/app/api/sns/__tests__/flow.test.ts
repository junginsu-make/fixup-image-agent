import { describe, expect, it, vi } from "vitest";
import { generateFlow, regenerateFlowCard, updateFlowCopy, type SnsFlowCard, type SnsFlowState } from "../flow-service";

const flow = (): SnsFlowState => ({
  stage: "copy",
  planningIssues: ["주 모델이 실패해 OpenAI 예비로 만들었습니다: timeout"],
  copyIssues: ["주 모델이 실패해 OpenAI 예비로 원고를 썼습니다: timeout"],
  cards: [
    { index: 1, kind: "generated", role: "cover", copy: { index: 1, headline: "긴 제목" }, status: "pending" },
    { index: 2, kind: "generated", role: "body", copy: { index: 2, headline: "둘째" }, status: "pending" },
    { index: 3, kind: "generated", role: "ending", copy: { index: 3, headline: "마지막" }, status: "pending" },
  ],
  costs: [],
});

describe("원고 수정", () => {
  it("길이 제한 없이 사용자가 쓴 원고를 그대로 저장한다", () => {
    const headline = "가".repeat(200);
    const updated = updateFlowCopy(flow(), 1, { headline, body: "나".repeat(400) });
    expect(updated.stage).toBe("copy");
    expect(updated.cards[0]!.copy.headline).toHaveLength(200);
    expect(updated.cards[0]!.copy.body).toHaveLength(400);
  });
});

describe("결과 생성", () => {
  it("원고 수정 뒤 전체를 다시 만들어도 이전 요청 비용을 지우지 않는다", async () => {
    const state = flow();
    state.costs = [{ cardIndex: 1, costUsd: 0.178 }];
    const result = await generateFlow(state, {
      generate: async (card) => ({ assetUrl: `/retry/${card.index}.jpg`, costUsd: 0.2 }),
      review: async () => ({ decision: "pass", summary: "통과", issues: [] }),
    });
    expect(result.costs).toEqual([
      { cardIndex: 1, costUsd: 0.178 },
      { cardIndex: 1, costUsd: 0.2 },
      { cardIndex: 2, costUsd: 0.2 },
      { cardIndex: 3, costUsd: 0.2 },
    ]);
  });

  it("한 카드 실패 뒤에도 계속하고 검수·미확정 비용을 남긴다", async () => {
    const generated: number[] = [];
    const result = await generateFlow(flow(), {
      generate: async (card) => {
        generated.push(card.index);
        if (card.index === 2) throw new Error("fal 응답 전 실패");
        return { assetUrl: `/fake/${card.index}.jpg`, costUsd: 0.178 };
      },
      review: async (card) => card.index === 1
        ? { decision: "fail", summary: "오탈자", issues: ["제목 확인"] }
        : { decision: "pass", summary: "통과", issues: [] },
    });

    expect(generated).toEqual([1, 2, 3]);
    expect(result.cards.map((card) => card.status)).toEqual(["review_required", "failed", "done"]);
    expect(result.cards[1]!.error).toBe("fal 응답 전 실패");
    expect(result.costs).toEqual([
      { cardIndex: 1, costUsd: 0.178 },
      { cardIndex: 2, costUsd: null },
      { cardIndex: 3, costUsd: 0.178 },
    ]);
  });

  it("원본 카드는 생성과 검수를 부르지 않는다", async () => {
    const generate = vi.fn(async () => ({ assetUrl: "x", costUsd: 1 }));
    const review = vi.fn(async () => ({ decision: "pass" as const, summary: "x", issues: [] }));
    const state: SnsFlowState = {
      ...flow(),
      cards: [
        { index: 1, kind: "place_as_is", role: "body", copy: { index: 1, headline: "원본" }, status: "pending", assetUrl: "/original.jpg" },
        { index: 2, kind: "ending_image", role: "ending", copy: { index: 2, headline: "엔딩" }, status: "pending", assetUrl: "/ending.jpg" },
      ],
    };
    const result = await generateFlow(state, { generate, review });
    expect(generate).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(result.costs).toEqual([]);
    expect(result.cards.every((card) => card.status === "done")).toBe(true);
  });

  it("다시 만들기는 명시적으로 호출한 카드만 실행한다", async () => {
    const generate = vi.fn(async (_card: SnsFlowCard) => ({ assetUrl: "/retry.jpg", costUsd: 0.2 }));
    const updated = await regenerateFlowCard(flow(), 2, {
      generate,
      review: async () => ({ decision: "pass", summary: "재검수 통과", issues: [] }),
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]![0].index).toBe(2);
    expect(updated.cards[1]!.status).toBe("done");
  });
});
