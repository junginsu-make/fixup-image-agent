import { describe, expect, it, vi } from "vitest";
import { BACKGROUND_REMOVAL_ENDPOINT, BACKGROUND_TIMEOUT_MS, createBackgroundRemover } from "../background";
import type { FalQueueOps, FalQueuePhase } from "../../fal/http";
import type { FalRouter } from "../../fal/route";

/**
 * **배경 제거도 공용 대기열을 탄다**(S3b, fix round 1). `createBackgroundRemover` 는 다리만 잇는다 —
 * 제출 자리에 비용을 안 싣는다(`onEnqueue` 가 적는다, 설계 §3.4), 끊으면 폴링을 멈추고 취소를
 * 보낸다, 간격은 고정 500ms 다(60초 시한에 3초씩 기다리면 너무 성기다).
 */
function 길(): FalRouter & { submitted: unknown[] } {
  const submitted: unknown[] = [];
  return {
    submitted,
    async submit(endpoint, input, options) {
      submitted.push({ endpoint, input, options });
      return { requestId: "bg-1", route: { accountId: "acct", key: "key-a" } };
    },
    async routeOf() { return { accountId: "acct", key: "key-a" }; },
    finished: vi.fn(),
    async uploadRoute() { return { accountId: "acct", key: "key-a" }; },
  };
}

function 묻기(phases: FalQueuePhase[], result: unknown = { image: { url: "https://fal/cut.png" } }) {
  const cancelled: string[] = [];
  const ops: FalQueueOps = {
    status: vi.fn(async () => phases.shift() ?? "completed"),
    result: vi.fn(async () => result),
    cancel: vi.fn(async (_e, id) => { cancelled.push(id); }),
  };
  return { cancelled, ops, opsFor: () => ops };
}

describe("createBackgroundRemover", () => {
  it("제출 자리에 비용을 안 싣는다 — onEnqueue 가 요청 번호를 받는다", async () => {
    const router = 길();
    const fake = 묻기(["completed"]);
    const seen: string[] = [];

    const remover = createBackgroundRemover(router, { opsFor: fake.opsFor, sleep: async () => {}, now: () => 0 });
    const result = await remover.subscribe(BACKGROUND_REMOVAL_ENDPOINT, {
      input: { image_url: "https://fal/m.png" },
      onEnqueue: (id) => seen.push(id),
    });

    expect(router.submitted).toEqual([{
      endpoint: BACKGROUND_REMOVAL_ENDPOINT,
      input: { image_url: "https://fal/m.png" },
      options: { startTimeoutS: 60, cost: undefined },
    }]);
    expect(seen).toEqual(["bg-1"]);
    expect(result).toEqual({ data: { image: { url: "https://fal/cut.png" } } });
  });

  it("끊으면 폴링을 멈추고 취소를 보낸다", async () => {
    const router = 길();
    const fake = 묻기(Array(5).fill("in_progress"));
    const controller = new AbortController();

    const remover = createBackgroundRemover(router, {
      opsFor: fake.opsFor,
      sleep: async () => { controller.abort(); },
    });
    const error = await remover.subscribe(BACKGROUND_REMOVAL_ENDPOINT, {
      input: { image_url: "https://fal/m.png" },
      abortSignal: controller.signal,
    }).catch((e: unknown) => e);

    expect((error as Error).name).toBe("AbortError");
    expect(fake.cancelled).toEqual(["bg-1"]);
  });

  it("폴링 간격은 500ms 로 고정 — 60초 시한에 3초씩 기다리지 않는다", async () => {
    const router = 길();
    const fake = 묻기(["queued", "in_progress", "completed"]);
    const sleeps: number[] = [];

    const remover = createBackgroundRemover(router, { opsFor: fake.opsFor, sleep: async (ms) => { sleeps.push(ms); }, now: () => 0 });
    await remover.subscribe(BACKGROUND_REMOVAL_ENDPOINT, { input: { image_url: "https://fal/m.png" } });

    expect(sleeps).toEqual([500, 500]);
    expect(BACKGROUND_TIMEOUT_MS).toBe(60_000);
  });
});
