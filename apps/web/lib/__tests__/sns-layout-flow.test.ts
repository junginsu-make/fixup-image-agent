import { describe, expect, it } from "vitest";
import type { LayoutSlot } from "@fixup/layout-core";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import type { SnsFlowCard, SnsFlowState } from "../../app/api/sns/flow-service";
import {
  pollQueuedFlow,
  startQueuedFlow,
  type QueuedGenerationDependencies,
} from "../sns/queued-flow";

/**
 * 레이아웃이 붙은 카드와 안 붙은 카드가 서로 다른 길로 간다.
 *
 * 가장 중요한 것은 **`layout` 이 없으면 지금까지와 한 글자도 다르지 않게
 * 동작한다**는 것이다. 새 기능이 옛 동작을 건드리면 그 자체로 실패다.
 */

const TEXT_STYLE = {
  family: "Pretendard",
  weight: 700 as const,
  sizeRatio: 0.3,
  lineHeight: 1.3,
  color: "#111111",
  align: "left" as const,
  valign: "top" as const,
};

/** 4:5 카드(1088×1360)에서 1088×1088 — nano 가 만들 수 있는 1:1. */
const SQUARE_IMAGE: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
  { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.8 } },
  { kind: "text", box: { x: 0.08, y: 0.84, width: 0.84, height: 0.1 }, source: { from: "copy", field: "headline" }, style: TEXT_STYLE },
];

/** 1088×680 — 1.6:1 이라 nano 의 열거 목록에 없다. */
const WIDE_IMAGE: LayoutSlot[] = [
  { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.5 } },
];

/** 그림 칸 둘 — 비포/애프터처럼 서로 다른 그림이 필요한 카드. */
const TWO_IMAGES: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#FFFFFF" },
  { kind: "image", box: { x: 0, y: 0, width: 1, height: 0.4 }, brief: "수리 전 벽" },
  { kind: "image", box: { x: 0, y: 0.4, width: 1, height: 0.4 }, brief: "수리 후 벽" },
  { kind: "text", box: { x: 0.08, y: 0.84, width: 0.84, height: 0.1 }, source: { from: "copy", field: "headline" }, style: TEXT_STYLE },
];

const TEXT_ONLY: LayoutSlot[] = [
  { kind: "background", box: { x: 0, y: 0, width: 1, height: 1 }, fill: "#0F172A" },
  { kind: "text", box: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, source: { from: "copy", field: "headline" }, style: TEXT_STYLE },
];

function project(): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "layout", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 4,
    data: {
      source: { kind: "text", text: "본문" },
      attachments: [{ id: "body-ref", kind: "style_reference", role: "body", assetPath: "user/references/body.jpg", url: "data:image/jpeg;base64,eA==" }],
    },
    slotPlan: { total: 4, cover: 1, placeAsIs: 0, aiBody: 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function flow(layout?: SnsFlowCard["layout"]): SnsFlowState {
  return {
    stage: "copy", planningIssues: [], copyIssues: [], costs: [],
    cards: [{
      index: 1, kind: "generated", role: "body",
      copy: { index: 1, headline: "제목" },
      plan: { index: 1, role: "body", intent: "뜻", visualBrief: "책상 위 노트북" },
      status: "pending",
      ...(layout ? { layout } : {}),
    }],
  };
}

interface Recorder {
  events: string[];
  scenePromptCalls: number;
  composedWithLayout: boolean;
  composedWithoutImage: boolean;
  /** 합성에 넘어온 칸별 그림. 칸마다 제 그림이 갔는지는 여기서만 알 수 있다. */
  composedSlots?: Record<number, string>;
  submits: string[];
  /** fal 에 실제로 보낸 값. 「칸 비율 그대로」가 지켜졌는지는 여기서만 알 수 있다. */
  submitted?: Record<string, unknown>;
}

function dependencies(record: Recorder): QueuedGenerationDependencies {
  const review = {
    decision: "pass" as const, summary: "통과", issues: [],
    textFidelity: { headline: "exact" as const, body: "not_applicable" as const, accent: "not_applicable" as const, footnote: "not_applicable" as const },
    extraCopy: { status: "none" as const, texts: [] },
  };
  return {
    sceneProvider: { generate: async () => { record.scenePromptCalls += 1; return "장면"; } },
    reviewPrimary: { review: async () => review },
    reviewBackup: { review: async () => review },
    uploadReference: async (attachment) => `https://fal.media/${attachment.id}`,
    queue: {
      submitJob: async (endpoint, input) => {
        record.events.push(`submit:${endpoint}`);
        record.submitted = input;
        record.submits.push(String((input as { prompt?: string }).prompt ?? ""));
        return { requestId: `fal-${record.submits.length}` };
      },
      jobStatus: async () => "completed",
      jobResult: async (_endpoint, requestId) => ({ images: [{ url: `https://fal.media/${requestId}.png` }] }),
    },
    requestStore: {
      // 요청마다 다른 장부 줄이다. 같은 id 를 돌려주면 두 칸의 비용이 한 줄에 겹친다.
      createSubmitted: async () => ({ id: `ledger-${record.submits.length}` }),
      complete: async () => {},
    },
    savePrompt: async () => {},
    saveSubmitted: async () => {},
    saveFailed: async () => {},
    saveAsset: async (images, card) => {
      record.events.push("asset");
      record.composedWithLayout = Boolean(card.layout);
      record.composedWithoutImage = typeof images !== "string" && Object.keys(images).length === 0;
      if (typeof images !== "string") record.composedSlots = images;
      return { assetPath: "user/sns/project/1.png", thumbPath: null, assetUrl: "/file/1", reviewUrl: "data:image/png;base64,eA==" };
    },
    saveReview: async () => {},
    saveOriginal: async () => { throw new Error("원본 없음"); },
  };
}

function recorder(): Recorder {
  return { events: [], scenePromptCalls: 0, composedWithLayout: false, composedWithoutImage: false, submits: [] };
}

describe("레이아웃이 없는 카드", () => {
  it("지금까지대로 장면 프롬프트를 받아 통째로 그린다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(project(), flow(), dependencies(record), { now: "2026-09-01T00:00:00.000Z" });

    expect(record.scenePromptCalls).toBe(1);
    expect(started.cards[0]!.prompt).not.toContain("No text, no letters");
    expect(record.events).toEqual(["submit:fal-ai/nano-banana/edit"]);
  });
});

describe("레이아웃이 붙은 카드", () => {
  it("장면 프롬프트를 묻지 않고 칸 프롬프트로 간다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: SQUARE_IMAGE }),
      dependencies(record),
      { now: "2026-09-01T00:00:00.000Z" },
    );

    expect(record.scenePromptCalls).toBe(0);
    expect(started.cards[0]!.slotJobs![0]!.prompt).toContain("No text, no letters");
    expect(started.cards[0]!.slotJobs![0]!.prompt).toContain("책상 위 노트북");
  });

  /**
   * 이 기능의 전부다. 카드 비율(4:5)로 시키면 칸에 넣을 때 여백이 생기거나
   * 잘린다. 칸이 1088×1088 이니 1:1 로 시켜야 한다.
   */
  it("카드 비율이 아니라 칸 비율로 시킨다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: SQUARE_IMAGE }),
      dependencies(record),
      { now: "2026-09-01T00:00:00.000Z" },
    );

    expect(record.submitted?.aspect_ratio).toBe("1:1");
    // 칸이 1:1 이라 nano 가 그대로 만들 수 있다 — 모델을 바꿀 이유가 없다.
    expect(started.cards[0]!.slotJobs![0]!.endpoint).toContain("nano-banana");
    expect(started.cards[0]!.promptWarnings).toEqual([]);
  });

  it("레이아웃이 없으면 카드 비율 그대로 시킨다", async () => {
    const record = recorder();
    await startQueuedFlow(project(), flow(), dependencies(record), { now: "2026-09-01T00:00:00.000Z" });

    expect(record.submitted?.aspect_ratio).toBe("4:5");
  });

  it("칸 비율을 못 만드는 모델이면 바꾸고 그 이유를 남긴다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: WIDE_IMAGE }),
      dependencies(record),
      { now: "2026-09-01T00:00:00.000Z" },
    );

    expect(started.cards[0]!.slotJobs![0]!.endpoint).toContain("gpt-image-2");
    expect(started.cards[0]!.promptWarnings!.join(" ")).toContain("맞는 크기가 없어");
  });

  it("그림 칸이 없는 뼈대는 fal 을 부르지 않고 바로 합성한다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: TEXT_ONLY }),
      dependencies(record),
      { now: "2026-09-01T00:00:00.000Z" },
    );

    expect(record.events).toEqual(["asset"]);
    expect(record.composedWithoutImage).toBe(true);
    expect(started.cards[0]!.status).toBe("done");
    expect(started.cards[0]!.assetPath).toBe("user/sns/project/1.png");
  });

  it("fal 이 그린 그림은 합성 경로로 간다", async () => {
    const record = recorder();
    const deps = dependencies(record);
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: SQUARE_IMAGE }),
      deps,
      { now: "2026-09-01T00:00:00.000Z" },
    );
    const polled = await pollQueuedFlow(project(), started, deps, { now: "2026-09-01T00:01:00.000Z" });

    expect(record.composedWithLayout).toBe(true);
    expect(record.composedWithoutImage).toBe(false);
    expect(polled.cards[0]!.status).toBe("done");
  });

  /**
   * 「다시 만들기」는 `startQueuedFlow` 에 카드 번호 하나만 주고 부른다.
   * 그 길에서도 뼈대가 살아 있어야 그 칸만 다시 그릴 수 있다.
   */
  it("그 칸만 다시 만들 때도 뼈대를 그대로 쓴다", async () => {
    const record = recorder();
    const started = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: SQUARE_IMAGE }),
      dependencies(record),
      { cardIndexes: [1], now: "2026-09-01T00:00:00.000Z" },
    );

    expect(record.scenePromptCalls).toBe(0);
    expect(record.submitted?.aspect_ratio).toBe("1:1");
    expect(started.cards[0]!.layout?.templateId).toBe("t");
  });

  /**
   * 레퍼런스에 그림 자리가 셋이면 셋 다 채워야 한다. 하나만 그리고 나머지를
   * 회색으로 두면 「레퍼런스 그대로」가 아니다.
   *
   * 칸마다 주문서가 다르다 — 「수리 전」과 「수리 후」를 한 번에 시킬 수 없다.
   */
  it("그림 칸이 둘이면 fal 을 두 번 부르고 칸마다 다른 것을 시킨다", async () => {
    const record = recorder();
    const deps = dependencies(record);
    let flowState = await startQueuedFlow(
      project(),
      flow({ templateId: "t", slots: TWO_IMAGES }),
      deps,
      { now: "2026-09-01T00:00:00.000Z" },
    );

    // 한 번에 하나씩 보낸다. 다 올 때까지 합성하지 않는다.
    expect(record.submits).toHaveLength(1);
    expect(record.events).not.toContain("asset");

    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:01:00.000Z" });
    expect(record.submits).toHaveLength(2);
    expect(record.events).not.toContain("asset");

    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:02:00.000Z" });

    expect(record.submits[0]).toContain("수리 전 벽");
    expect(record.submits[1]).toContain("수리 후 벽");
    // 두 칸이 서로 다른 그림을 받았다.
    expect(Object.keys(record.composedSlots ?? {})).toEqual(["1", "2"]);
    expect(record.composedSlots![1]).not.toBe(record.composedSlots![2]);
    expect(flowState.cards[0]!.status).toBe("done");
  });

  it("그림 칸이 둘이면 비용 장부도 두 줄이다", async () => {
    const record = recorder();
    const deps = dependencies(record);
    let flowState = await startQueuedFlow(
      project(), flow({ templateId: "t", slots: TWO_IMAGES }), deps, { now: "2026-09-01T00:00:00.000Z" },
    );
    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:01:00.000Z" });
    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:02:00.000Z" });

    expect(flowState.costs).toHaveLength(2);
    expect(flowState.costs.every((cost) => typeof cost.costUsd === "number")).toBe(true);
  });

  it("한 칸이 실패해도 나머지로 카드를 만든다", async () => {
    const record = recorder();
    const deps = dependencies(record);
    // 둘째 요청만 결과를 못 읽는다.
    deps.queue.jobResult = async (_endpoint, requestId) => {
      if (requestId === "fal-2") throw new Error("fal 결과 없음");
      return { images: [{ url: `https://fal.media/${requestId}.png` }] };
    };

    let flowState = await startQueuedFlow(
      project(), flow({ templateId: "t", slots: TWO_IMAGES }), deps, { now: "2026-09-01T00:00:00.000Z" },
    );
    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:01:00.000Z" });
    flowState = await pollQueuedFlow(project(), flowState, deps, { now: "2026-09-01T00:02:00.000Z" });

    // 원칙 하나 — 카드는 나온다.
    expect(record.events).toContain("asset");
    expect(Object.keys(record.composedSlots ?? {})).toEqual(["1"]);
    expect(flowState.cards[0]!.assetPath).toBe("user/sns/project/1.png");
  });
});
