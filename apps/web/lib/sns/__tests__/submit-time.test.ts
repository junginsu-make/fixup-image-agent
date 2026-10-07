import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SnsProjectRecord } from "../../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../../app/api/sns/flow-service";
import { pollQueuedFlow, startQueuedFlow, type QueuedGenerationDependencies } from "../queued-flow";

/**
 * **카드의 시작 시각은 fal 에 실제로 보낸 시각이다**(2026-10-07 Task 6).
 *
 * 화면의 「늦어지고 있습니다」 안내가 이 시각부터 3분을 잰다. 전에는 요청이 들어온 시각을 적어,
 * 장면 프롬프트를 쓰는 동안(운영 224초)이 그림 업체가 늦은 것으로 셈해졌다. 다음 카드도
 * 검수가 끝난 뒤에 보내는데 상태 조회가 시작된 시각이 적혔다.
 */
const T0 = Date.parse("2026-10-07T07:54:00.000Z");
const SCENE_MS = 224_000;
const REVIEW_MS = 30_000;

function project(): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "time", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 4,
    data: { source: { kind: "text", text: "본문" }, attachments: [] },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function flow(): SnsFlowState {
  return {
    stage: "copy", planningIssues: [], copyIssues: [], costs: [],
    cards: [1, 2].map((index) => ({
      index, kind: "generated" as const, role: "body" as const,
      copy: { index, headline: `${index}번` },
      plan: { index, role: "body" as const, intent: "뜻", visualBrief: "장면" },
      status: "pending" as const,
    })),
  };
}

const pass = {
  decision: "pass", summary: "통과", issues: [],
  textFidelity: { headline: "exact", body: "not_applicable", accent: "not_applicable", footnote: "not_applicable" },
  extraCopy: { status: "none", texts: [] },
};

function dependencies(): QueuedGenerationDependencies {
  let submitted = 0;
  return {
    sceneProvider: { generate: async () => { vi.setSystemTime(Date.now() + SCENE_MS / 2); return "장면"; } },
    reviewPrimary: { review: async () => { vi.setSystemTime(Date.now() + REVIEW_MS); return pass; } },
    reviewBackup: { review: async () => pass },
    uploadReference: async (attachment) => `https://fal.media/${attachment.id}`,
    queue: {
      submitJob: async () => { submitted += 1; return { requestId: `fal-${submitted}` }; },
      jobStatus: async () => "completed",
      jobResult: async () => ({ images: [{ url: "https://fal.media/result.png" }] }),
    },
    requestStore: { createSubmitted: async (row) => ({ id: `ledger-${row.cardIndex}` }), complete: async () => {} },
    savePrompt: async () => {},
    saveSubmitted: async () => {},
    saveFailed: async () => {},
    saveAsset: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1", reviewUrl: "data:," }),
    saveReview: async () => {},
    saveOriginal: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1" }),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe("fal 제출 시각", () => {
  it("첫 장은 장면 프롬프트를 다 쓴 뒤 보낸 시각을 적는다", async () => {
    const started = await startQueuedFlow(project(), flow(), dependencies());

    expect(started.generation?.startedAt).toBe(new Date(T0).toISOString());
    expect(started.cards[0]!.generationStartedAt).toBe(new Date(T0 + SCENE_MS).toISOString());
  });

  it("다음 장은 앞 장 검수가 끝난 뒤 보낸 시각을 적는다", async () => {
    const deps = dependencies();
    const started = await startQueuedFlow(project(), flow(), deps);
    const pollAt = Date.now();
    const polled = await pollQueuedFlow(project(), started, deps);

    expect(polled.cards[1]!.status).toBe("generating");
    expect(polled.cards[1]!.generationStartedAt).toBe(new Date(pollAt + REVIEW_MS).toISOString());
  });

  it("시각을 정해 주면 그 시각을 쓴다 — 시험 · 30분 포기 계산이 그대로다", async () => {
    const started = await startQueuedFlow(project(), flow(), dependencies(), { now: "2026-09-01T00:00:00.000Z" });
    expect(started.cards[0]!.generationStartedAt).toBe("2026-09-01T00:00:00.000Z");
  });
});
