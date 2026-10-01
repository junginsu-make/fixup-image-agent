import { describe, expect, it, vi } from "vitest";
import { createFalQueueClient } from "../queue";
import type { FalQueueOps } from "../http";
import type { FalRouter } from "../route";

/**
 * **포스터·카드뉴스의 fal 큐**(S3b). 제출은 `router` 가 계정을 골라 보내고, 상태·결과는 그 요청을 보낸
 * 계정의 키로 묻는다. 끝났으면(`completed`) 계정의 진행 중 수에서 뺀다.
 */
function 길() {
  const log: string[] = [];
  const router: FalRouter = {
    async submit(endpoint, _input, options) {
      log.push(`submit ${endpoint} ${JSON.stringify(options)}`);
      return { requestId: "fal-1", route: { accountId: "acct-b", key: "key-b" } };
    },
    async routeOf(requestId) { log.push(`routeOf ${requestId}`); return { accountId: "acct-b", key: "key-b" }; },
    finished(requestId) { log.push(`finished ${requestId}`); },
    async uploadRoute() { return { accountId: null, key: "env" }; },
  };
  return { log, router };
}

function 묻기(status: "queued" | "in_progress" | "completed", data: unknown = { images: [] }) {
  const keys: string[] = [];
  const ops: FalQueueOps = { status: vi.fn(async () => status), result: vi.fn(async () => data), cancel: vi.fn() };
  return { keys, ops, opsFor: (key: string) => { keys.push(key); return ops; } };
}

describe("공용 fal queue", () => {
  it("한 번 제출하고 requestId 를 즉시 돌려준다 — 값(모델 id·장수)을 함께 넘긴다", async () => {
    const { log, router } = 길();
    const queue = createFalQueueClient(router, 묻기("queued").opsFor);
    expect(await queue.submitJob("openai/gpt-image-2.5/flare/edit", { prompt: "x", num_images: 3 })).toEqual({ requestId: "fal-1" });
    expect(log).toEqual(['submit openai/gpt-image-2.5/flare/edit {"cost":{"model":"gpt-image-2.5-flare","images":3}}']);
  });

  it("상태·결과는 보낸 계정의 키로 묻고, 새 작업을 제출하지 않는다", async () => {
    const { log, router } = 길();
    const fake = 묻기("completed", { images: [{ url: "https://fal.media/result.png" }, {}] });
    const queue = createFalQueueClient(router, fake.opsFor);
    expect(await queue.jobStatus("openai/gpt-image-2/edit", "fal-1")).toBe("completed");
    expect(await queue.jobResult("openai/gpt-image-2/edit", "fal-1")).toEqual({ images: [{ url: "https://fal.media/result.png" }] });
    expect(fake.keys).toEqual(["key-b", "key-b"]);
    expect(log.filter((line) => line.startsWith("submit"))).toEqual([]);
  });

  it("끝났을 때만 진행 중에서 뺀다", async () => {
    const running = 길();
    await createFalQueueClient(running.router, 묻기("in_progress").opsFor).jobStatus("e", "fal-1");
    expect(running.log).not.toContain("finished fal-1");
    const done = 길();
    await createFalQueueClient(done.router, 묻기("completed").opsFor).jobStatus("e", "fal-1");
    expect(done.log).toContain("finished fal-1");
  });
});
