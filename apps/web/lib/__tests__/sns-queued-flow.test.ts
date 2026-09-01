import { describe, expect, it, vi } from "vitest";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../app/api/sns/flow-service";
import {
  QUEUE_GIVE_UP_MS,
  QUEUE_POLL_INTERVAL_MS,
  hasActiveQueuedGeneration,
  pollQueuedFlow,
  startQueuedFlow,
  type QueuedGenerationDependencies,
} from "../sns/queued-flow";

function project(): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "queue", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 4,
    data: {
      source: { kind: "text", text: "본문" },
      attachments: [{ id: "body-ref", kind: "style_reference", role: "body", assetPath: "user/references/body.jpg", url: "data:image/jpeg;base64,eA==" }],
    },
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
      plan: { index, role: "body" as const, intent: `${index}번`, visualBrief: `${index}번 장면` },
      status: "pending" as const,
    })),
  };
}

function dependencies(events: string[], status: QueuedGenerationDependencies["queue"]["jobStatus"] = async () => "in_progress"):
  QueuedGenerationDependencies {
  let submitted = 0;
  return {
    sceneProvider: { generate: async () => "장면" },
    reviewPrimary: { review: async () => ({
      decision: "pass", summary: "통과", issues: [],
      textFidelity: { headline: "exact", body: "not_applicable", accent: "not_applicable", footnote: "not_applicable" },
      extraCopy: { status: "none", texts: [] },
    }) },
    reviewBackup: { review: async () => ({
      decision: "pass", summary: "예비 통과", issues: [],
      textFidelity: { headline: "exact", body: "not_applicable", accent: "not_applicable", footnote: "not_applicable" },
      extraCopy: { status: "none", texts: [] },
    }) },
    uploadReference: async (attachment) => { events.push(`upload:${attachment.id}`); return `https://fal.media/${attachment.id}`; },
    queue: {
      submitJob: async (_endpoint, _input) => {
        submitted += 1;
        events.push(`submit:${submitted}`);
        return { requestId: `fal-${submitted}` };
      },
      jobStatus: status,
      jobResult: async () => ({ images: [{ url: "https://fal.media/result.png" }] }),
    },
    requestStore: {
      createSubmitted: async (row) => { events.push(`ledger:create:${row.cardIndex}`); return { id: `ledger-${row.cardIndex}` }; },
      complete: async (id) => { events.push(`ledger:complete:${id}`); },
    },
    savePrompt: async (cardIndex) => { events.push(`prompt:${cardIndex}`); },
    saveSubmitted: async (cardIndex) => { events.push(`submitted:${cardIndex}`); },
    saveFailed: async (cardIndex) => { events.push(`failed:${cardIndex}`); },
    saveAsset: async (_url, card) => { events.push(`asset:${card.index}`); return { assetPath: `user/sns/project/${card.index}.png`, assetUrl: `/file/${card.index}`, reviewUrl: `data:image/png;base64,eA==` }; },
    saveReview: async (cardIndex) => { events.push(`review:${cardIndex}`); },
    saveOriginal: async () => { throw new Error("원본 없음"); },
  };
}

describe("비동기 fal 큐 시작", () => {
  it("04 원고 확인의 pending 카드는 아직 생성 중으로 보지 않는다", () => {
    expect(hasActiveQueuedGeneration(flow())).toBe(false);
  });

  it("첨부를 배치당 한 번만 올리고 첫 카드만 submit한 뒤 request_id를 장부에 저장한다", async () => {
    expect(QUEUE_POLL_INTERVAL_MS).toBe(10_000);
    const events: string[] = [];
    const deps = dependencies(events);
    let submittedInput: Record<string, unknown> | undefined;
    const submitJob = deps.queue.submitJob;
    deps.queue.submitJob = async (endpoint, input) => {
      submittedInput = input;
      return submitJob(endpoint, input);
    };
    const started = await startQueuedFlow(project(), flow(), deps, { now: "2026-09-01T00:00:00.000Z" });

    expect(events).toEqual([
      "upload:body-ref", "prompt:1", "prompt:2",
      "submit:1", "ledger:create:1", "submitted:1",
    ]);
    expect(started.cards.map((card) => card.status)).toEqual(["generating", "pending"]);
    expect(submittedInput?.image_urls).toEqual(["https://fal.media/body-ref"]);
    expect(JSON.stringify(submittedInput)).not.toContain("data:image");
    expect(started.cards[0]).toMatchObject({ falRequestId: "fal-1", generationRequestId: "ledger-1" });
    expect(started.costs).toMatchObject([{ cardIndex: 1, costUsd: null, falRequestId: "fal-1" }]);
  });
});

describe("비동기 fal 큐 폴링", () => {
  it("완료 비용을 이미지 저장보다 먼저 확정하고 그다음 카드 하나를 제출한다", async () => {
    const events: string[] = [];
    const deps = dependencies(events, async () => {
      events.push("status:1");
      return "completed";
    });
    deps.reviewPrimary = { review: async () => { throw new Error("Claude 검수 실패"); } };
    const started = await startQueuedFlow(project(), flow(), deps, { now: "2026-09-01T00:00:00.000Z" });
    events.length = 0;
    const polled = await pollQueuedFlow(project(), started, deps, { now: "2026-09-01T00:01:00.000Z" });

    expect(events).toEqual([
      "status:1", "ledger:complete:ledger-1", "asset:1", "review:1",
      "submit:2", "ledger:create:2", "submitted:2",
    ]);
    expect(polled.cards.map((card) => card.status)).toEqual(["done", "generating"]);
    expect(polled.cards[0]!.reviewIssues?.join("\n")).toContain("예비로 검수했습니다");
    expect(polled.costs.map((cost) => cost.costUsd)).toEqual([0.039, null]);
  });

  it("30분 뒤 상태 조회를 포기해도 request_id를 남기고 다음 카드로 진행한다", async () => {
    expect(QUEUE_GIVE_UP_MS).toBe(30 * 60_000);
    const events: string[] = [];
    const status = vi.fn(async () => "in_progress" as const);
    const deps = dependencies(events, status);
    const started = await startQueuedFlow(project(), flow(), deps, { now: "2026-09-01T00:00:00.000Z" });
    events.length = 0;
    const polled = await pollQueuedFlow(project(), started, deps, { now: "2026-09-01T00:30:00.001Z" });

    expect(status).not.toHaveBeenCalled();
    expect(polled.cards[0]).toMatchObject({ status: "failed", falRequestId: "fal-1" });
    expect(polled.cards[0]!.error).toContain("30분");
    expect(polled.cards[0]!.error).toContain("fal-1");
    expect(polled.cards[1]!.status).toBe("generating");
  });
});
