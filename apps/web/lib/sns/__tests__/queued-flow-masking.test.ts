import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LayoutSlot } from "@fixup/layout-core";
import type { SnsProjectRecord } from "../../../app/api/sns/projects/project-service";
import type { SnsFlowCard, SnsFlowState } from "../../../app/api/sns/flow-service";
import { pollQueuedFlow, startQueuedFlow, type QueuedGenerationDependencies } from "../queued-flow";

/**
 * **카드의 실패 까닭(`card.error`)에 업체 · 저장소 원문을 싣지 않는다**(2026-10-07 오류 원문 가리기 Task 3).
 *
 * 그 글은 흐름에 저장되고(`saveFailed`) 카드뉴스 결과판 · 쉽게 모드에 뜬다. fal 결과 읽기 실패는 fal 실패 분류의
 * 사람 말로, 합성 · 원본 저장 실패는 고정 문장으로 남기고 원문은 서버 기록에만. 일부러 쓴 문장(「30분 동안 …」,
 * 「fal 완료 응답에 이미지가 없습니다.」)은 그대로다.
 */
const 날것 = "Unprocessable Entity: content_policy_violation https://queue.fal.run/fal-ai/x/requests/abc?token=SECRET";

function project(): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "queue", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 4,
    data: { source: { kind: "text", text: "본문" }, attachments: [] },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function flow(card: Partial<SnsFlowCard> = {}): SnsFlowState {
  return {
    stage: "copy", planningIssues: [], copyIssues: [], costs: [],
    cards: [{
      index: 1, kind: "generated", role: "body",
      copy: { index: 1, headline: "제목" },
      plan: { index: 1, role: "body", intent: "뜻", visualBrief: "장면" },
      status: "pending",
      ...card,
    }],
  };
}

const TEXT_ONLY: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#0F172A" },
];

let saved: string[] = [];

function dependencies(over: Partial<QueuedGenerationDependencies> = {}): QueuedGenerationDependencies {
  return {
    sceneProvider: { generate: async () => "장면" },
    reviewPrimary: { review: async () => { throw new Error("검수 없음"); } },
    reviewBackup: { review: async () => { throw new Error("검수 없음"); } },
    uploadReference: async (attachment) => `https://fal.media/${attachment.id}`,
    queue: {
      submitJob: async () => ({ requestId: "fal-1" }),
      jobStatus: async () => "completed",
      jobResult: async () => ({ images: [{ url: "https://fal.media/result.png" }] }),
    },
    requestStore: { createSubmitted: async () => ({ id: "ledger-1" }), complete: async () => {} },
    savePrompt: async () => {},
    saveSubmitted: async () => {},
    saveFailed: async (_index, error) => { saved.push(error); },
    saveAsset: async () => ({ assetPath: "u/sns/p/1.png", thumbPath: null, assetUrl: "/file/1", reviewUrl: "data:image/png;base64,eA==" }),
    saveReview: async () => {},
    saveOriginal: async () => ({ assetPath: "u/sns/p/1.png", thumbPath: null, assetUrl: "/file/1" }),
    ...over,
  };
}

const NOW = { now: "2026-09-01T00:00:00.000Z" };
const LATER = { now: "2026-09-01T00:01:00.000Z" };

let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  saved = [];
});
afterEach(() => errors.mockRestore());

describe("fal 결과 읽기 실패", () => {
  async function pollWith(jobResult: QueuedGenerationDependencies["queue"]["jobResult"], card?: Partial<SnsFlowCard>) {
    const deps = dependencies();
    const started = await startQueuedFlow(project(), flow(card), deps, NOW);
    deps.queue = { ...deps.queue, jobResult };
    return pollQueuedFlow(project(), started, deps, LATER);
  }

  it("fal 이 거절한 원문 대신 fal 실패 분류의 사람 말 — 저장되는 글도 같다", async () => {
    const rejected = Object.assign(new Error(날것), { status: 422 });
    const polled = await pollWith(async () => { throw rejected; });

    expect(polled.cards[0]!.status).toBe("failed");
    expect(polled.cards[0]!.error).toBe(
      "그림 생성 쪽에서 이 요청을 거절했습니다. 같은 내용으로 다시 눌러도 같은 결과입니다. 지시 문구를 바꾸거나 다른 모델로 시도해 보세요.",
    );
    expect(saved).toEqual([polled.cards[0]!.error]);
    expect(logged()).toContain("content_policy_violation");
  });

  it("상태 코드 없는 원문은 「가져오지 못했습니다」로", async () => {
    const polled = await pollWith(async () => { throw new Error(날것); });
    expect(polled.cards[0]!.error).toBe("만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요.");
  });

  it("칸 하나가 실패해도 칸 까닭에 원문이 없다", async () => {
    const slots: LayoutSlot[] = [{ kind: "image", box: { x: 0, y: 0, width: 1, height: 0.8 } }];
    const polled = await pollWith(async () => { throw new Error(날것); }, { layout: { templateId: "t", slots } });
    expect(polled.cards[0]!.slotJobs![0]!.error).toBe("만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요.");
    expect(JSON.stringify(polled.cards[0])).not.toContain("content_policy_violation");
  });

  it("일부러 쓴 「fal 완료 응답에 이미지가 없습니다.」는 그대로", async () => {
    const polled = await pollWith(async () => ({ images: [] }));
    expect(polled.cards[0]!.error).toBe("fal 완료 응답에 이미지가 없습니다.");
  });
});

describe("합성 · 원본 저장 실패", () => {
  it("합성 실패는 고정 문장 — 저장소 원문은 기록에만", async () => {
    const deps = dependencies({ saveAsset: async () => { throw new Error(`storage upload failed ${날것}`); } });
    const started = await startQueuedFlow(project(), flow({ layout: { templateId: "t", slots: TEXT_ONLY } }), deps, NOW);
    expect(started.cards[0]).toMatchObject({ status: "failed", error: "카드를 합성하지 못했습니다." });
    expect(logged()).toContain("storage upload failed");
  });

  it("사용자 원본 저장 실패도 고정 문장", async () => {
    const deps = dependencies({ saveOriginal: async () => { throw new Error(`storage copy failed ${날것}`); } });
    const started = await startQueuedFlow(project(), flow({ kind: "place_as_is", plan: undefined }), deps, NOW);
    expect(started.cards[0]).toMatchObject({ status: "failed", error: "사용자 원본을 저장하지 못했습니다." });
    expect(logged()).toContain("storage copy failed");
  });
});
