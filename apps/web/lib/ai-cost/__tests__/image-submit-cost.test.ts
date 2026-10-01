import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **그림은 제출하는 자리에서 한 줄**(설계 2026-09-30 §3.4·§5).
 *
 * fal 큐는 제출하면 과금이 끝난다. 상태 조회는 여러 번 오거나 아예 안 올 수 있어
 * 거기서 적으면 두 번 적히거나 빠진다. 상세페이지·리디자인도 S3a 부터 대기열 제출 자리에서,
 * 배경 제거는 fal 이 요청을 받은 순간(`onEnqueue`)에 적는다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../../fal/upload", () => ({ createFalUploader: () => ({ uploadReference: async () => "https://fal/ref.png" }) }));

const { replaceAiCostWriterForTest } = await import("../write");
const { bindAiCaller, withLlmMeter } = await import("../../llm/meter");
const { createFalQueueClient, falModelIdFor } = await import("../../fal/queue");
const { envFalRouter } = await import("../../fal/route");
const { submitFalQueue } = await import("../../fal/http");
const { createPdpImageGenerator } = await import("../../pdp/fal");
const { removeBackground } = await import("../../ad/background");
const { createRedesignImageGenerator } = await import("../../redesign/image-generator");

type Row = Record<string, unknown>;
let rows: Row[] = [];
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Row); });
});
afterEach(() => {
  replaceAiCostWriterForTest(null);
  vi.unstubAllGlobals();
});

describe("fal 큐(포스터·카드뉴스)", () => {
  /** 서버 키 하나로 보내는 길에 가짜 fetch 를 끼운다 — 제출 자리(`lib/fal/http.ts`)가 적는지 본다. */
  const queueWith = (response: () => Response) =>
    createFalQueueClient(envFalRouter({ FAL_KEY: "key" }, (key, endpoint, input, options) =>
      submitFalQueue(key, endpoint, input, options, async () => response())));

  it("제출에 한 줄 — 모델 id·요청 장수·fal 요청 id·작업 문맥을 싣는다", async () => {
    const queue = queueWith(() => new Response(JSON.stringify({ request_id: "fal-9" })));
    await withLlmMeter(async () => {
      bindAiCaller({ userId: USER, requestId: null, operation: "poster" });
      await queue.submitJob("fal-ai/nano-banana-pro/edit", { prompt: "x", num_images: 3 });
    });
    expect(rows).toEqual([expect.objectContaining({
      p_user: USER, p_operation: "poster", p_provider: "fal", p_model: "nano-banana-pro",
      p_images: 3, p_usd: null, p_basis: "image_unit", p_fal_request_id: "fal-9",
    })]);
  });

  it("제출이 실패하면 적지 않는다 — 과금되지 않았다", async () => {
    const queue = queueWith(() => new Response("busy", { status: 429 }));
    await withLlmMeter(async () => {
      await expect(queue.submitJob("fal-ai/nano-banana-pro", { prompt: "x" })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });

  it("상태·결과 조회는 적지 않는다", async () => {
    const ops = { status: vi.fn(async () => "completed" as const), result: vi.fn(async () => ({ images: [] })), cancel: vi.fn() };
    const queue = createFalQueueClient(envFalRouter({ FAL_KEY: "key" }), () => ops);
    await withLlmMeter(async () => {
      await queue.jobStatus("fal-ai/nano-banana-pro", "fal-1");
      await queue.jobResult("fal-ai/nano-banana-pro", "fal-1");
    });
    expect(rows).toEqual([]);
  });

  it("엔드포인트로 단가표의 모델 id 를 찾는다. 모르면 그대로 둔다", () => {
    expect(falModelIdFor("openai/gpt-image-2.5/flare/edit")).toBe("gpt-image-2.5-flare");
    expect(falModelIdFor("fal-ai/nano-banana-2")).toBe("nano-banana-2");
    expect(falModelIdFor("someone/new-model")).toBe("someone/new-model");
  });
});

/**
 * 상세페이지·캐릭터·리디자인은 S3a 부터 **대기열**이다(설계 2026-09-29 §3.3). 제출 자리(`lib/fal/http.ts`)
 * 에서 한 줄 — 상태·결과 조회와 그림 내려받기는 적지 않는다.
 */
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const 대기열 = (submit: () => Response, result: unknown) => async (url: string) => {
  const target = String(url);
  if (!target.startsWith("https://queue.fal.run/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
  if (target.includes("/status")) return json({ status: "COMPLETED" });
  if (target.includes("/requests/")) return json(result);
  return submit();
};

describe("상세페이지·캐릭터(대기열 fal)", () => {
  it("제출 자리에서 한 줄 — fal 이 준 요청 번호를 싣는다", async () => {
    vi.stubGlobal("fetch", 대기열(() => json({ request_id: "q-1" }), { images: [{ url: "https://cdn/x.png", content_type: "image/png" }] }));
    await withLlmMeter(async () => {
      await createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] });
    });
    expect(rows).toEqual([expect.objectContaining({ p_provider: "fal", p_model: "nano-banana", p_images: 1, p_fal_request_id: "q-1" })]);
  });

  it("fal 이 제출을 거절하면 적지 않는다", async () => {
    vi.stubGlobal("fetch", 대기열(() => new Response("busy", { status: 429 }), {}));
    await withLlmMeter(async () => {
      await expect(createPdpImageGenerator({ FAL_KEY: "k" })("nano-banana", { prompt: "p", systemPrompt: "s", aspectRatio: "3:4", references: [] })).rejects.toThrow();
    });
    expect(rows).toEqual([]);
  });
});

describe("리디자인(대기열 fal)", () => {
  it("제출 자리에서 한 줄 — 실제로 그린 모델 id 로", async () => {
    vi.stubGlobal("fetch", 대기열(() => json({ request_id: "rd-1" }), { images: [{ url: "https://cdn/r.png" }] }));
    await withLlmMeter(async () => {
      await createRedesignImageGenerator({ FAL_KEY: "k" })({ prompt: "p", references: [], size: "1152x2048" });
    });
    expect(rows).toEqual([expect.objectContaining({ p_model: "gpt-image-2.5-flare", p_images: 1, p_fal_request_id: "rd-1" })]);
  });
});

describe("광고 배경 제거", () => {
  it("fal 이 요청을 받은 순간 한 줄 — 결과를 기다리다 시간이 넘어도 이미 적혀 있다", async () => {
    const fal = {
      subscribe: async (_endpoint: string, options: { onEnqueue?: (id: string) => void }) => {
        options.onEnqueue?.("bg-1");
        return { data: { image: { url: "https://fal/cut.png" } } };
      },
    };
    await withLlmMeter(async () => { await removeBackground("https://fal/m.png", fal as never); });
    expect(rows).toEqual([expect.objectContaining({ p_model: "fal-ai/birefnet/v2", p_images: 1, p_fal_request_id: "bg-1" })]);
  });
});
