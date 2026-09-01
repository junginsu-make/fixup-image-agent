import { describe, expect, it, vi } from "vitest";
import type { PlanProvider, CopyProvider } from "@fixup/sns-core";
import { createActualPlanningFlow } from "../sns/actual-flow";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

function project(): SnsProjectRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    title: "실제 제공자 테스트",
    status: "draft",
    ratio: "4:5",
    language: "ko",
    modelId: "nano-banana",
    cardCountMode: "fixed",
    cardCount: 4,
    data: {
      source: { kind: "text", text: "AI 자동화는 작은 업무부터 시작한다." },
      attachments: [{
        id: "cover-ref",
        kind: "style_reference",
        role: "cover",
        assetPath: "user/references/cover.png",
        url: "https://example.com/cover.png",
      }],
    },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("실제 기획·원고 배선", () => {
  it("planCards와 writeCopy에 예비 제공자를 모두 넘긴다", async () => {
    const planningPrimary: PlanProvider = { generate: vi.fn(async () => { throw new Error("Claude 기획 실패"); }) };
    const planningBackup: PlanProvider = { generate: vi.fn(async () => ({
      total: 4,
      cards: [
        { index: 1, role: "cover", intent: "표지", visualBrief: "표지 장면" },
        { index: 2, role: "body", intent: "설명 1", visualBrief: "속지 장면 1" },
        { index: 3, role: "body", intent: "설명 2", visualBrief: "속지 장면 2" },
      ],
    })) };
    const copyPrimary: CopyProvider = { generate: vi.fn(async () => { throw new Error("Claude 원고 실패"); }) };
    const copyBackup: CopyProvider = { generate: vi.fn(async () => ({ cards: [
      { index: 1, headline: "표지" },
      { index: 2, headline: "속지 1" },
      { index: 3, headline: "속지 2" },
    ] })) };

    const flow = await createActualPlanningFlow(project(), {
      planningPrimary, planningBackup, copyPrimary, copyBackup,
    });

    expect(planningBackup.generate).toHaveBeenCalledOnce();
    expect(copyBackup.generate).toHaveBeenCalledOnce();
    expect(flow.planningIssues.join("\n")).toContain("예비로 만들었습니다");
    expect(flow.copyIssues.join("\n")).toContain("예비로 원고를 썼습니다");
    expect(flow.cards).toHaveLength(4);
  });
});
