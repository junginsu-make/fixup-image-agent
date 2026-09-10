import { describe, expect, it, vi } from "vitest";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";
import type { SnsFlowState } from "../../app/api/sns/flow-service";
import {
  QUEUE_GIVE_UP_MS,
  QUEUE_POLL_INTERVAL_MS,
  hasActiveQueuedGeneration,
  pollQueuedFlow,
  startQueuedFlow,
  stopQueuedGeneration,
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
    saveAsset: async (_url, card) => { events.push(`asset:${card.index}`); return { assetPath: `user/sns/project/${card.index}.png`, thumbPath: `user/sns/project/${card.index}.thumb.webp`, assetUrl: `/file/${card.index}`, reviewUrl: `data:image/png;base64,eA==` }; },
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

describe("사람이 중지했을 때", () => {
  it("생성 중으로 보지 않는다", async () => {
    const started = await startQueuedFlow(project(), flow(), dependencies([]), { now: "2026-09-01T00:00:00.000Z" });
    expect(hasActiveQueuedGeneration(started)).toBe(true);

    const stopped = stopQueuedGeneration(started, "2026-09-01T00:05:00.000Z");
    expect(hasActiveQueuedGeneration(stopped)).toBe(false);
    expect(stopped.generation?.completedAt).toBe("2026-09-01T00:05:00.000Z");
  });

  it("아직 못 받은 카드에만 이유를 남긴다", async () => {
    const started = await startQueuedFlow(project(), flow(), dependencies([]), { now: "2026-09-01T00:00:00.000Z" });
    started.cards[0]!.status = "done";

    const stopped = stopQueuedGeneration(started, "2026-09-01T00:05:00.000Z");
    expect(stopped.cards[0]!.status).toBe("done");
    expect(stopped.cards[0]!.error).toBeUndefined();
    expect(stopped.cards[1]!.status).toBe("failed");
    expect(stopped.cards[1]!.error).toContain("중지");
  });

  it("원래 흐름을 건드리지 않는다", async () => {
    const started = await startQueuedFlow(project(), flow(), dependencies([]), { now: "2026-09-01T00:00:00.000Z" });
    stopQueuedGeneration(started, "2026-09-01T00:05:00.000Z");
    expect(hasActiveQueuedGeneration(started)).toBe(true);
  });
});

describe("흐름에 미리보기 자리를 남긴다", () => {
  it("저장이 돌려준 미리보기 자리를 카드에 적는다", async () => {
    // **흐름 JSON 이 읽는 쪽의 유일한 근거다.** 표(`sns_cards`)에만 적으면
    // 목록·삭제가 보는 이 자리에는 값이 없어서, 미리보기 파일은 만들어지되
    // 아무도 못 찾는다 — 기능이 통째로 죽고 실패 신호도 없다.
    const events: string[] = [];
    const deps = dependencies(events, async () => "completed" as const);
    const started = await startQueuedFlow(project(), flow(), deps, { now: "2026-09-01T00:00:00.000Z" });

    const polled = await pollQueuedFlow(project(), started, deps, { now: "2026-09-01T00:01:00.000Z" });

    const done = polled.cards.find((card) => card.status === "done");
    expect(done?.assetPath).toBe("user/sns/project/1.png");
    expect(done?.thumbPath).toBe("user/sns/project/1.thumb.webp");
  });
});

/**
 * **자리마다 적은 말이 그 자리에만 가는가** (2026-09-08 리뷰가 잡은 자리).
 *
 * 호출부는 맞았는데 그것을 지키는 시험이 없었다. 기존 시험은 프롬프트 본문을
 * 한 번도 안 보고, 카드가 전부 `body` 라 표지/속지를 가르는 상황 자체가 안
 * 만들어졌다. 그래서 `intentForRole(intents, card.role)` 을
 * `intentForRole(intents, "cover")` 로 바꿔도 통과했다.
 */
describe("자리별 지시가 새지 않는가", () => {
  function mixedProject(): SnsProjectRecord {
    const base = project();
    return {
      ...base,
      data: {
        ...base.data,
        attachments: [
          { id: "cover-ref", kind: "style_reference", role: "cover", assetPath: "a", url: "data:image/jpeg;base64,eA==" },
          { id: "body-ref", kind: "style_reference", role: "body", assetPath: "b", url: "data:image/jpeg;base64,eA==" },
        ],
        attachmentIntents: { cover: "표지전용문구", body: "", ending: "" },
      },
    };
  }

  function mixedFlow(): SnsFlowState {
    return {
      stage: "copy", planningIssues: [], copyIssues: [], costs: [],
      cards: [
        {
          index: 1, kind: "generated" as const, role: "cover" as const,
          copy: { index: 1, headline: "표지" },
          plan: { index: 1, role: "cover" as const, intent: "표지", visualBrief: "표지 장면" },
          status: "pending" as const,
        },
        {
          index: 2, kind: "generated" as const, role: "body" as const,
          copy: { index: 2, headline: "속지" },
          plan: { index: 2, role: "body" as const, intent: "속지", visualBrief: "속지 장면" },
          status: "pending" as const,
        },
      ],
    };
  }

  it("표지에 적은 말이 속지 카드에는 안 간다", async () => {
    const events: string[] = [];
    const deps = dependencies(events);
    const prompts = new Map<number, string>();
    deps.savePrompt = async (cardIndex, prompt) => { prompts.set(cardIndex, prompt); };

    const started = await startQueuedFlow(mixedProject(), mixedFlow(), deps, { now: "2026-09-01T00:00:00.000Z" });

    const cover = started.cards.find((card) => card.index === 1)!;
    const body = started.cards.find((card) => card.index === 2)!;
    expect(cover.prompt, "표지 프롬프트에 표지 지시가 있어야 한다").toContain("표지전용문구");
    expect(body.prompt, "속지 프롬프트에 표지 지시가 새면 안 된다").not.toContain("표지전용문구");
  });

  it("지시를 적으면 그 자리의 역할 고정 문구가 사라진다", async () => {
    const deps = dependencies([]);
    const started = await startQueuedFlow(mixedProject(), mixedFlow(), deps, { now: "2026-09-01T00:00:00.000Z" });
    const cover = started.cards.find((card) => card.index === 1)!;
    const body = started.cards.find((card) => card.index === 2)!;
    expect(cover.prompt).not.toContain("Do NOT copy anything else from it");
    // 속지는 안 적었으므로 지금까지 그대로다.
    expect(body.prompt).toContain("Do NOT copy anything else from it");
  });

  it("안 적었으면 어느 카드에도 USER INSTRUCTION 이 안 붙는다", async () => {
    const base = mixedProject();
    const plain = { ...base, data: { ...base.data, attachmentIntents: undefined } };
    const deps = dependencies([]);
    const started = await startQueuedFlow(plain, mixedFlow(), deps, { now: "2026-09-01T00:00:00.000Z" });
    for (const card of started.cards) expect(card.prompt).not.toContain("USER INSTRUCTION");
  });
  /**
   * **낱장을 다시 만들 때 사람이 적는 말**(사용자 요청 2026-09-09).
   *
   * 지금까지 「다시 만들기」는 같은 프롬프트로 한 번 더 돌리는 것뿐이었다.
   * 마음에 안 들어서 누르는 버튼인데 **무엇이 마음에 안 드는지 말할 자리가
   * 없었다.** 이미지 만들기의 「이 장만 고치기」는 이미 그 자리를 준다.
   */
  describe("낱장을 다시 만들 때 적는 말", () => {
    it("적은 말이 그 카드 프롬프트에 실린다", async () => {
      const deps = dependencies([]);
      const started = await startQueuedFlow(mixedProject(), mixedFlow(), deps, {
        now: "2026-09-01T00:00:00.000Z",
        cardIndexes: [1],
        note: "인물을 더 밝게",
      });
      const cover = started.cards.find((card) => card.index === 1)!;
      expect(cover.prompt).toContain("인물을 더 밝게");
    });

    /**
     * 원래 지시를 지우면 안 된다 — 이번 말은 **덧붙이는** 것이다.
     *
     * **작업에 저장된 지시로 잰다.** 처음엔 자리별 첨부 지시(`표지전용문구`)로
     * 쟀는데 그건 다른 경로라, 「적은 말이 원래 지시를 덮는」 잘못된 구현에서도
     * 통과했다(뮤테이션 생존).
     */
    it("작업에 저장된 지시를 지우지 않는다", async () => {
      const deps = dependencies([]);
      const project = mixedProject();
      project.data.userInstruction = "작업전체지시";
      const started = await startQueuedFlow(project, mixedFlow(), deps, {
        now: "2026-09-01T00:00:00.000Z",
        cardIndexes: [1],
        note: "인물을 더 밝게",
      });
      const cover = started.cards.find((card) => card.index === 1)!;
      expect(cover.prompt, "작업 지시가 그대로 있어야 한다").toContain("작업전체지시");
      expect(cover.prompt, "이번에 적은 말도 있어야 한다").toContain("인물을 더 밝게");
      expect(cover.prompt, "자리별 지시도 그대로다").toContain("표지전용문구");
    });

    /** 안 적으면 지금까지와 똑같이 돈다. */
    it("안 적으면 지금까지대로다", async () => {
      const deps = dependencies([]);
      const withNote = await startQueuedFlow(mixedProject(), mixedFlow(), deps, {
        now: "2026-09-01T00:00:00.000Z", cardIndexes: [1],
      });
      const plain = await startQueuedFlow(mixedProject(), mixedFlow(), deps, {
        now: "2026-09-01T00:00:00.000Z", cardIndexes: [1], note: undefined,
      });
      expect(withNote.cards.find((c) => c.index === 1)!.prompt)
        .toBe(plain.cards.find((c) => c.index === 1)!.prompt);
    });
  });
});

