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
    }, {
      ingestYoutube: async () => ({ segments: [] }),
      ingestWeb: async () => ({ segments: [] }),
      research: async () => ({ text: "", citations: [] }),
    });

    expect(planningBackup.generate).toHaveBeenCalledOnce();
    expect(copyBackup.generate).toHaveBeenCalledOnce();
    expect(flow.planningIssues.join("\n")).toContain("예비로 만들었습니다");
    expect(flow.copyIssues.join("\n")).toContain("예비로 원고를 썼습니다");
    expect(flow.cards).toHaveLength(4);
  });

  it("유튜브 주소면 자막을 실제로 가져와 LLM 에 넘긴다", async () => {
    // 예전에는 "가져올 주소: https://..." 만 넘겨 LLM 이 내용을 지어냈다.
    const prompts: string[] = [];
    const planningPrimary: PlanProvider = {
      generate: vi.fn(async (prompt: string) => {
        prompts.push(prompt);
        return { total: 4, cards: [{ index: 1, role: "cover", intent: "훅", visualBrief: "표지" }] };
      }),
    };
    const copyPrimary: CopyProvider = {
      generate: vi.fn(async () => ({ cards: [{ index: 1, headline: "제목" }] })),
    };

    const youtube = project();
    youtube.data.source = { kind: "youtube", url: "https://youtu.be/abc12345678" };

    await createActualPlanningFlow(youtube, {
      planningPrimary, planningBackup: planningPrimary, copyPrimary, copyBackup: copyPrimary,
    }, {
      ingestYoutube: async () => ({ segments: [{ text: "실제 자막 내용입니다" }] }),
      ingestWeb: async () => ({ segments: [] }),
      research: async () => ({ text: "", citations: [] }),
    });

    expect(prompts[0]).toContain("실제 자막 내용입니다");
    expect(prompts[0]).not.toContain("가져올 주소");
  });

  it("내용을 못 가져오면 기획을 시작하지 않는다 — 지어내면 안 된다", async () => {
    const planningPrimary: PlanProvider = { generate: vi.fn(async () => ({ cards: [] })) };
    const copyPrimary: CopyProvider = { generate: vi.fn(async () => ({ cards: [] })) };

    const youtube = project();
    youtube.data.source = { kind: "youtube", url: "https://youtu.be/abc12345678" };

    const flow = await createActualPlanningFlow(youtube, {
      planningPrimary, planningBackup: planningPrimary, copyPrimary, copyBackup: copyPrimary,
    }, {
      ingestYoutube: async () => { throw new Error("자막이 없습니다"); },
      ingestWeb: async () => ({ segments: [] }),
      research: async () => ({ text: "", citations: [] }),
    });

    expect(planningPrimary.generate).not.toHaveBeenCalled();
    expect(flow.planningIssues.join(" ")).toContain("자막이 없습니다");
  });
});
