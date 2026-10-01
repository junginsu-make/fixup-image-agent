import { describe, expect, it, vi } from "vitest";
import { FAL_RUN_QUEUED_POLL_MS, FalRunTimeoutError, runFalQueued } from "../run";
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
    // 줄 서 있는 동안은 3초, 만드는 중이면 1초 — 100명이 몰려 대부분 줄에 있을 때 서버가 내는 상태 확인을 줄인다
    expect(sleeps).toEqual([FAL_RUN_QUEUED_POLL_MS, 1000]);
    expect(FAL_RUN_QUEUED_POLL_MS).toBe(3000);
    expect(router.submitted).toEqual([{ endpoint: "fal-ai/x", input: { a: 1 }, options: { startTimeoutS: 120, cost: { model: "m", images: 1 } } }]);
    expect(router.done).toEqual(["r-1"]);
  });

  it("pollMs 를 주면 줄에서도 그 간격 — 배경 제거처럼 짧은 시한을 쓸 때 3초를 강제하지 않는다", async () => {
    const router = 길();
    const fake = 묻기(["queued", "in_progress", "completed"], { images: [{ url: "u" }] });
    const sleeps: number[] = [];
    await runFalQueued(router, { endpoint: "fal-ai/x", input: {}, pollMs: 500 }, {
      opsFor: fake.opsFor, sleep: async (ms) => { sleeps.push(ms); }, now: () => 0,
    });
    expect(sleeps).toEqual([500, 500]);
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

  it("onSubmitted 가 던져도 finished — 계정 칸이 묶이지 않는다", async () => {
    const router = 길();
    const boom = () => { throw new Error("hook"); };
    await expect(runFalQueued(router, { endpoint: "e", input: {}, onSubmitted: boom }, { opsFor: 묻기(["completed"]).opsFor })).rejects.toThrow("hook");
    expect(router.done).toEqual(["r-1"]);
  });

  it("상한 초과 문구는 상세페이지·리디자인과 같다", () => {
    expect(new FalRunTimeoutError("r").message).toBe("이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.");
  });
});
