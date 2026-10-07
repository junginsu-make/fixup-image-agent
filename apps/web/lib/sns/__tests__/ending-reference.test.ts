import { describe, expect, it } from "vitest";
import { groupAttachments, type Attachment } from "@fixup/sns-core";
import type { SnsProjectRecord } from "../../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../../app/api/sns/flow-service";
import { estimateCost } from "../../../app/sns/cost-estimate";
import { slotRows } from "../../../app/sns/_components/slot-rows";
import { startQueuedFlow, type QueuedGenerationDependencies } from "../queued-flow";

/**
 * **엔딩 자리 그림이 없으면 속지(없으면 표지) 그림으로 그리고, 비용 예상 · 화면 자리 표시도
 * 같은 결과를 낸다**(2026-10-07 Task 5 (b)).
 *
 * 셋이 어긋나면 화면은 「참고 없음」인데 실제로는 그림이 가거나, 예약은 t2i 값인데 실제는
 * edit 값이 나간다. 판정은 `selectReferencesForRole` 한 곳이다.
 */
const bodyRef: Attachment = {
  id: "body-ref", kind: "style_reference", role: "body", assetPath: "user/references/body.jpg", url: "https://example.com/body.jpg",
};

function project(attachments: Attachment[]): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "ending", status: "copy_ready",
    // 편집과 그리기 값이 다른 모델이라야 어긋남이 보인다.
    ratio: "4:5", language: "ko", modelId: "gpt-image-2", cardCountMode: "fixed", cardCount: 4,
    data: { source: { kind: "text", text: "본문" }, attachments },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function flow(): SnsFlowState {
  const roles = ["cover", "body", "body", "ending"] as const;
  return {
    stage: "copy", planningIssues: [], copyIssues: [], costs: [],
    cards: roles.map((role, offset) => ({
      index: offset + 1, kind: "generated" as const, role,
      copy: { index: offset + 1, headline: `${offset + 1}번` },
      plan: { index: offset + 1, role: role === "cover" ? "cover" as const : "body" as const, intent: "뜻", visualBrief: "장면" },
      status: "pending" as const,
    })),
  };
}

function dependencies(submitted: Array<{ endpoint: string; input: Record<string, unknown> }>, uploads: string[]):
  QueuedGenerationDependencies {
  return {
    sceneProvider: { generate: async () => "장면" },
    reviewPrimary: { review: async () => { throw new Error("검수 없음"); } },
    reviewBackup: { review: async () => { throw new Error("검수 없음"); } },
    uploadReference: async (attachment) => { uploads.push(attachment.id); return `https://fal.media/${attachment.id}`; },
    queue: {
      submitJob: async (endpoint, input) => { submitted.push({ endpoint, input }); return { requestId: "fal-1" }; },
      jobStatus: async () => "in_progress",
      jobResult: async () => ({ images: [] }),
    },
    requestStore: { createSubmitted: async () => ({ id: "ledger-1" }), complete: async () => {} },
    savePrompt: async () => {},
    saveSubmitted: async () => {},
    saveFailed: async () => {},
    saveAsset: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1", reviewUrl: "data:," }),
    saveReview: async () => {},
    saveOriginal: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1" }),
  };
}

const NOW = { now: "2026-09-01T00:00:00.000Z" };

describe("엔딩 자리 그림이 없을 때", () => {
  it("엔딩 카드는 속지 그림을 붙여 편집으로 보낸다", async () => {
    const submitted: Array<{ endpoint: string; input: Record<string, unknown> }> = [];
    const uploads: string[] = [];
    const started = await startQueuedFlow(project([bodyRef]), flow(), dependencies(submitted, uploads), { ...NOW, cardIndexes: [4] });

    expect(uploads).toEqual(["body-ref"]);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]!.endpoint).toBe("openai/gpt-image-2/edit");
    expect(submitted[0]!.input.image_urls).toEqual(["https://fal.media/body-ref"]);
    expect(started.cards[3]!.prompt).toContain("CARD-NEWS REFERENCE");
  });

  it("비용 예상이 실제로 보낸 값과 같다", async () => {
    const submitted: Array<{ endpoint: string; input: Record<string, unknown> }> = [];
    const started = await startQueuedFlow(project([bodyRef]), flow(), dependencies(submitted, []), { ...NOW, cardIndexes: [4] });
    const estimate = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [bodyRef], onlyCardIndexes: [4],
    });

    expect(estimate.generatedCount).toBe(1);
    expect(estimate.usd).toBeCloseTo(started.costs[0]!.unitCostUsd!, 10);
  });

  it("화면도 엔딩 자리에 그 그림을 보여 준다", () => {
    const rows = slotRows(groupAttachments([bodyRef]));
    expect(rows.find((row) => row.slot === "ending")?.picks.map((pick) => pick.id)).toEqual(["body-ref"]);
  });

  it("엔딩 이미지를 올렸으면 그 카드는 그대로 넣으므로 자리 표시도 비용도 없다", () => {
    const endingImage: Attachment = { id: "ending-image", kind: "ending", assetPath: "user/e.png", url: "https://example.com/e.png" };
    const rows = slotRows(groupAttachments([bodyRef, endingImage]));
    expect(rows.map((row) => row.slot)).toEqual(["body"]);
    const estimate = estimateCost({
      ratio: "4:5", modelId: "gpt-image-2", totalCards: 4, attachments: [bodyRef, endingImage], onlyCardIndexes: [4],
    });
    expect(estimate.generatedCount).toBe(0);
  });
});
