import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **대기열 제출 한 번**(설계 2026-09-29 §3.3). 제출은 손으로 보낸다 — 공식 클라이언트는 429 를 같은
 * 키로 세 번 다시 보내서, 계정 풀이 「곧바로 다음 계정」으로 옮길 수 없다.
 */
vi.mock("server-only", () => ({}));

const { replaceAiCostWriterForTest } = await import("../../ai-cost/write");
const { withLlmMeter } = await import("../../llm/meter");
const { FAL_KEY_PROBE_URL, FalHttpError, checkFalKey, falQueueOps, submitFalQueue } = await import("../http");

type Row = Record<string, unknown>;
let rows: Row[] = [];
beforeEach(() => {
  rows = [];
  replaceAiCostWriterForTest(async (row) => { rows.push(row as unknown as Row); });
});
afterEach(() => replaceAiCostWriterForTest(null));

const 받은 = (response: Response) => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return response;
  };
  return { seen, fetchImpl };
};

describe("submitFalQueue", () => {
  it("queue.fal.run/<엔드포인트 전체> 로 Key 인증·JSON 몸통을 보내고 요청 번호를 돌려준다", async () => {
    const { seen, fetchImpl } = 받은(new Response(JSON.stringify({ request_id: "r-1" })));
    const id = await submitFalQueue("k-1", "fal-ai/nano-banana/edit", { prompt: "p" }, {}, fetchImpl);
    expect(id).toBe("r-1");
    expect(seen[0]!.url).toBe("https://queue.fal.run/fal-ai/nano-banana/edit");
    expect(seen[0]!.init?.method).toBe("POST");
    expect(seen[0]!.init?.headers).toEqual({ Authorization: "Key k-1", "Content-Type": "application/json" });
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ prompt: "p" });
  });

  it("fal 쪽 대기 상한은 x-fal-request-timeout 머리로 간다", async () => {
    const { seen, fetchImpl } = 받은(new Response(JSON.stringify({ request_id: "r-1" })));
    await submitFalQueue("k", "fal-ai/x", {}, { startTimeoutS: 120 }, fetchImpl);
    expect((seen[0]!.init?.headers as Record<string, string>)["x-fal-request-timeout"]).toBe("120");
  });

  it("실패는 상태 코드와 원문을 실은 FalHttpError 다 — 같은 키로 다시 보내지 않는다", async () => {
    const { seen, fetchImpl } = 받은(new Response('{"detail":"busy"}', { status: 429 }));
    const error = await submitFalQueue("k", "fal-ai/x", {}, {}, fetchImpl).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FalHttpError);
    expect(error).toMatchObject({ status: 429, body: '{"detail":"busy"}' });
    expect(seen).toHaveLength(1);
  });

  it("요청 번호가 없으면 502 로 본다", async () => {
    const { fetchImpl } = 받은(new Response("{}"));
    await expect(submitFalQueue("k", "fal-ai/x", {}, {}, fetchImpl)).rejects.toMatchObject({ status: 502 });
  });

  it("값을 주면 제출 자리에서 비용 한 줄 — 실패한 제출은 적지 않는다", async () => {
    await withLlmMeter(async () => {
      const ok = 받은(new Response(JSON.stringify({ request_id: "r-9" })));
      await submitFalQueue("k", "fal-ai/x", {}, { cost: { model: "nano-banana", images: 1 } }, ok.fetchImpl);
      const bad = 받은(new Response("no", { status: 401 }));
      await submitFalQueue("k", "fal-ai/x", {}, { cost: { model: "nano-banana", images: 1 } }, bad.fetchImpl).catch(() => undefined);
    });
    expect(rows).toEqual([expect.objectContaining({ p_provider: "fal", p_model: "nano-banana", p_images: 1, p_basis: "image_unit", p_fal_request_id: "r-9" })]);
  });

  it("값을 안 주면 적지 않는다(부르는 쪽이 따로 적는다)", async () => {
    await withLlmMeter(async () => {
      await submitFalQueue("k", "fal-ai/x", {}, {}, 받은(new Response(JSON.stringify({ request_id: "r-2" }))).fetchImpl);
    });
    expect(rows).toEqual([]);
  });
});

describe("falQueueOps", () => {
  it("키마다 클라이언트를 따로 만든다 — 전역 설정을 바꾸지 않는다", () => {
    const made: string[] = [];
    const factory = (config: { credentials: string }) => {
      made.push(config.credentials);
      return { queue: {} } as never;
    };
    falQueueOps("k-a", factory);
    falQueueOps("k-b", factory);
    expect(made).toEqual(["k-a", "k-b"]);
  });

  it("상태 셋을 우리 말로 바꾼다", async () => {
    const answers = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"];
    const ops = falQueueOps("k", () => ({ queue: { status: async () => ({ status: answers.shift() }) } }) as never);
    expect([await ops.status("e", "r"), await ops.status("e", "r"), await ops.status("e", "r")]).toEqual(["queued", "in_progress", "completed"]);
  });
});

describe("checkFalKey", () => {
  const 답 = (status: number, body = "") => async () => new Response(body, { status });

  it("없는 요청의 상태를 Key 인증으로 묻는다 — 그림을 만들지 않는다", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    await checkFalKey("k-1", async (url, init) => { seen.push({ url, init }); return new Response("", { status: 404 }); });
    expect(seen[0]!.url).toBe(FAL_KEY_PROBE_URL);
    expect(seen[0]!.url).toMatch(/\/requests\/[0-9a-f-]+\/status$/);
    expect(seen[0]!.init).toEqual({ method: "GET", headers: { Authorization: "Key k-1" } });
  });

  it("404(그런 요청 없음)·200 이면 키가 살아 있다", async () => {
    expect(await checkFalKey("k", 답(404, '{"status":"NOT_FOUND"}'))).toEqual({ ok: true });
    expect(await checkFalKey("k", 답(200))).toEqual({ ok: true });
  });

  it("401·403 이면 키가 틀렸다", async () => {
    expect(await checkFalKey("k", 답(401, '{"detail":"invalid key credentials"}'))).toEqual({ ok: false, reason: "invalid", status: 401, detail: '{"detail":"invalid key credentials"}' });
    expect(await checkFalKey("k", 답(403))).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("그 밖(5xx·429·네트워크)은 「지금 확인할 수 없음」— 틀렸다고 말하지 않는다", async () => {
    expect(await checkFalKey("k", 답(503))).toMatchObject({ ok: false, reason: "unavailable", status: 503 });
    expect(await checkFalKey("k", 답(429))).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await checkFalKey("k", async () => { throw new Error("fetch failed"); })).toMatchObject({ ok: false, reason: "unavailable" });
  });
});
