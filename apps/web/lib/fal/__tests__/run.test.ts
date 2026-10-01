import { describe, expect, it, vi } from "vitest";
import { FalRunTimeoutError, runFalQueued } from "../run";
import type { FalQueueOps, FalQueuePhase } from "../http";
import type { FalRouter } from "../route";

/**
 * **맡기고 이 요청 안에서 묻는다**(설계 2026-09-29 §3.3). 끝나면 반드시 `finished` — 계정 풀이
 * 동시 수를 그것으로 센다. 빠뜨리면 그 계정이 30분 동안 찬 것으로 보인다.
 */

function 길(): FalRouter & { submitted: unknown[]; done: string[] } {
  const submitted: unknown[] = [];
  const done: string[] = [];
  return {
    submitted,
    done,
    async submit(endpoint, input, options) {
      submitted.push({ endpoint, input, options });
      return { requestId: "r-1", route: { accountId: "acct-2", key: "key-2" } };
    },
    async routeOf() { return { accountId: "acct-2", key: "key-2" }; },
    finished(requestId) { done.push(requestId); },
    async uploadRoute() { return { accountId: "acct-2", key: "key-2" }; },
  };
}

function 묻기(phases: FalQueuePhase[], result: unknown = { images: [] }) {
  const keys: string[] = [];
  const cancelled: string[] = [];
  const ops: FalQueueOps = {
    status: vi.fn(async () => phases.shift() ?? "completed"),
    result: vi.fn(async () => result),
    cancel: vi.fn(async (_e, id) => { cancelled.push(id); }),
  };
  return { keys, cancelled, ops, opsFor: (key: string) => { keys.push(key); return ops; } };
}

describe("runFalQueued", () => {
  it("보낸 계정의 키로 묻고, 끝나면 결과 본문을 돌려준다", async () => {
    const router = 길();
    const fake = 묻기(["queued", "in_progress", "completed"], { images: [{ url: "u" }] });
    const sleeps: number[] = [];
    const out = await runFalQueued(router, { endpoint: "fal-ai/x", input: { a: 1 }, cost: { model: "m", images: 1 } }, {
      opsFor: fake.opsFor, sleep: async (ms) => { sleeps.push(ms); }, now: () => 0,
    });
    expect(out).toEqual({ requestId: "r-1", data: { images: [{ url: "u" }] } });
    expect(fake.keys).toEqual(["key-2"]);
    expect(sleeps).toEqual([1000, 1000]);
    expect(router.submitted).toEqual([{ endpoint: "fal-ai/x", input: { a: 1 }, options: { startTimeoutS: 120, cost: { model: "m", images: 1 } } }]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("상한을 넘기면 취소를 한 번 보내고 FalRunTimeoutError — 그래도 finished", async () => {
    const router = 길();
    const fake = 묻기(Array(20).fill("in_progress"));
    let clock = 0;
    const error = await runFalQueued(router, { endpoint: "e", input: {}, deadlineMs: 3_000 }, {
      opsFor: fake.opsFor, sleep: async (ms) => { clock += ms; }, now: () => clock,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalRunTimeoutError);
    expect(fake.cancelled).toEqual(["r-1"]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("결과가 실패로 끝나면 그 예외 그대로 — 그래도 finished", async () => {
    const router = 길();
    const fake = 묻기(["completed"]);
    fake.ops.result = vi.fn(async () => { throw Object.assign(new Error("bad"), { status: 422 }); });
    await expect(runFalQueued(router, { endpoint: "e", input: {} }, { opsFor: fake.opsFor, sleep: async () => {} })).rejects.toMatchObject({ status: 422 });
    expect(router.done).toEqual(["r-1"]);
  });

  it("끊으면 취소를 보내고 멈춘다", async () => {
    const router = 길();
    const fake = 묻기(Array(5).fill("in_progress"));
    const controller = new AbortController();
    const error = await runFalQueued(router, { endpoint: "e", input: {}, signal: controller.signal }, {
      opsFor: fake.opsFor, sleep: async () => { controller.abort(); },
    }).catch((e: unknown) => e);
    expect((error as Error).name).toBe("AbortError");
    expect(fake.cancelled).toEqual(["r-1"]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("제출이 실패하면 묻지도 finished 하지도 않는다(받은 번호가 없다)", async () => {
    const router = 길();
    router.submit = async () => { throw Object.assign(new Error("busy"), { status: 429 }); };
    const fake = 묻기([]);
    await expect(runFalQueued(router, { endpoint: "e", input: {} }, { opsFor: fake.opsFor })).rejects.toMatchObject({ status: 429 });
    expect(fake.keys).toEqual([]);
    expect(router.done).toEqual([]);
  });

  it("onSubmitted 는 fal 이 받은 순간 한 번", async () => {
    const seen: string[] = [];
    await runFalQueued(길(), { endpoint: "e", input: {}, onSubmitted: (id) => seen.push(id) }, { opsFor: 묻기(["completed"]).opsFor });
    expect(seen).toEqual(["r-1"]);
  });
});
