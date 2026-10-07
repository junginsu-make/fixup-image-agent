import { describe, expect, it } from "vitest";
import type { SnsProjectRecord } from "../../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../../app/api/sns/flow-service";
import { SCENE_PROMPT_CONCURRENCY, startQueuedFlow, type QueuedGenerationDependencies } from "../queued-flow";
import { mapWithLimit } from "../limited-map";

/**
 * **장면 프롬프트를 동시에 최대 3장까지 쓴다**(2026-10-07 생성 속도 Task 4).
 *
 * 한 장씩 차례로 쓰느라 6장 작업의 첫 제출이 224초 늦었다. 동시에 쓰되 카드마다
 * 받는 입력 · 결과 순서 · 실패했을 때의 결과는 그대로여야 한다.
 */
const CARD_COUNT = 6;

function project(): SnsProjectRecord {
  return {
    id: "project-1", userId: "user-1", title: "queue", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: CARD_COUNT,
    data: { source: { kind: "text", text: "본문" }, attachments: [] },
    slotPlan: { total: CARD_COUNT, cover: 1, placeAsIs: 0, aiBody: CARD_COUNT - 2, ending: 1, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

function flow(): SnsFlowState {
  return {
    stage: "copy", planningIssues: [], copyIssues: [], costs: [],
    cards: Array.from({ length: CARD_COUNT }, (_, offset) => {
      const index = offset + 1;
      return {
        index, kind: "generated" as const, role: "body" as const,
        copy: { index, headline: `제목${index}번` },
        plan: { index, role: "body" as const, intent: `뜻${index}번`, visualBrief: `장면${index}번` },
        status: "pending" as const,
      };
    }),
  };
}

/** 프롬프트 글에 적힌 카드 제목으로 어느 카드의 요청인지 안다. */
function cardOf(prompt: string): number {
  const found = /제목(\d+)번/.exec(prompt);
  if (!found) throw new Error("카드를 알 수 없는 요청");
  return Number(found[1]);
}

function dependencies(
  sceneProvider: QueuedGenerationDependencies["sceneProvider"],
  events: string[] = [],
): QueuedGenerationDependencies {
  return {
    sceneProvider,
    reviewPrimary: { review: async () => { throw new Error("검수 없음"); } },
    reviewBackup: { review: async () => { throw new Error("검수 없음"); } },
    uploadReference: async (attachment) => `https://fal.media/${attachment.id}`,
    queue: {
      submitJob: async () => { events.push("submit"); return { requestId: "fal-1" }; },
      jobStatus: async () => "in_progress",
      jobResult: async () => ({ images: [] }),
    },
    requestStore: { createSubmitted: async () => ({ id: "ledger-1" }), complete: async () => {} },
    savePrompt: async (cardIndex) => { events.push(`prompt:${cardIndex}`); },
    saveSubmitted: async () => {},
    saveFailed: async () => {},
    saveAsset: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1", reviewUrl: "data:," }),
    saveReview: async () => {},
    saveOriginal: async () => ({ assetPath: "u/1.png", thumbPath: null, assetUrl: "/file/1" }),
  };
}

const NOW = { now: "2026-09-01T00:00:00.000Z" };

/** 뒤 카드가 먼저 끝나게 늦춘다 — 순서가 섞여도 제자리에 들어가는지 본다. */
function delayFor(card: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, (CARD_COUNT - card) * 5));
}

describe("카드뉴스 장면 프롬프트 동시 작성", () => {
  it("동시에 3장까지만 쓴다", async () => {
    expect(SCENE_PROMPT_CONCURRENCY).toBe(3);
    let running = 0;
    let peak = 0;
    const deps = dependencies({
      generate: async (request) => {
        running += 1;
        peak = Math.max(peak, running);
        await delayFor(cardOf(request.prompt));
        running -= 1;
        return `장면글${cardOf(request.prompt)}`;
      },
    });
    await startQueuedFlow(project(), flow(), deps, NOW);
    expect(peak).toBe(3);
  });

  it("늦게 끝난 카드도 제 카드에 들어가고, 저장 · 제출 순서는 그대로다", async () => {
    const events: string[] = [];
    const finished: number[] = [];
    const deps = dependencies({
      generate: async (request) => {
        const card = cardOf(request.prompt);
        await delayFor(card);
        finished.push(card);
        return `장면글${card}`;
      },
    }, events);
    const started = await startQueuedFlow(project(), flow(), deps, NOW);

    expect(finished).not.toEqual([1, 2, 3, 4, 5, 6]);
    started.cards.forEach((card) => {
      expect(card.prompt).toContain(`장면글${card.index}`);
      const others = started.cards.filter((other) => other.index !== card.index);
      others.forEach((other) => expect(card.prompt).not.toContain(`장면글${other.index}`));
    });
    expect(events).toEqual(["prompt:1", "prompt:2", "prompt:3", "prompt:4", "prompt:5", "prompt:6", "submit"]);
    expect(started.cards.map((card) => card.status)).toEqual(["generating", "pending", "pending", "pending", "pending", "pending"]);
  });

  it("한 장의 장면 작성이 실패하면 지금처럼 빈 장면으로 이어 간다", async () => {
    const failing = await startQueuedFlow(project(), flow(), dependencies({
      generate: async (request) => {
        const card = cardOf(request.prompt);
        if (card === 3) throw new Error("업체 실패");
        return `장면글${card}`;
      },
    }), NOW);
    const empty = await startQueuedFlow(project(), flow(), dependencies({
      generate: async (request) => {
        const card = cardOf(request.prompt);
        return card === 3 ? "" : `장면글${card}`;
      },
    }), NOW);

    expect(failing.cards.map((card) => card.prompt)).toEqual(empty.cards.map((card) => card.prompt));
    expect(failing.cards[0]!.status).toBe("generating");
  });
});

describe("mapWithLimit", () => {
  it("결과를 넣은 순서대로 돌려준다", async () => {
    const result = await mapWithLimit([30, 10, 20], 3, async (wait) => {
      await new Promise((resolve) => setTimeout(resolve, wait));
      return wait * 2;
    });
    expect(result).toEqual([60, 20, 40]);
  });

  it("하나가 실패하면 그 실패로 끝나고 새 일을 더 시작하지 않는다", async () => {
    const started: number[] = [];
    await expect(mapWithLimit([1, 2, 3, 4, 5, 6], 2, async (item) => {
      started.push(item);
      await new Promise((resolve) => setTimeout(resolve, item === 1 ? 1 : 20));
      if (item === 1) throw new Error("첫 일 실패");
      return item;
    })).rejects.toThrow("첫 일 실패");
    // 돌고 있던 2번이 끝난 뒤에도 3번을 잡지 않는지 본다.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(started).toEqual([1, 2]);
  });

  it("빈 목록이면 아무것도 부르지 않는다", async () => {
    let calls = 0;
    expect(await mapWithLimit([], 3, async () => { calls += 1; })).toEqual([]);
    expect(calls).toBe(0);
  });
});
