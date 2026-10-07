import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **기획 · 검수가 시간 초과면 같은 요청을 다시 기다리지 않는다**(2026-10-07 운영 조사).
 *
 * SDK 는 시간 초과도 재시도한다(`maxRetries: 2`). 그래서 120초 제한에 걸린 기획은
 * 같은 요청을 두 번 더 기다려 약 6분 뒤에야 OpenAI 로 넘어갔다 — 오늘 7건 중 6건.
 *
 * 과부하(429 · 529)처럼 짧게 다시 부르면 풀리는 경우는 지금처럼 SDK 가 다시 부른다.
 * 그래서 SDK 를 가짜로 바꾸지 않고 **진짜 SDK 에 가짜 `fetch`** 를 끼워 잰다.
 */
vi.mock("server-only", () => ({}));
const openaiCalls: unknown[] = [];
vi.mock("openai", () => ({
  default: class {
    responses = {
      create: async (args: { tools: Array<{ name: string }> }) => {
        openaiCalls.push(args);
        return { output: [{ type: "function_call", name: args.tools[0]!.name, arguments: JSON.stringify({ from: "openai" }) }] };
      },
    };
  },
}));

const 환경 = { ANTHROPIC_API_KEY: "a-key", OPENAI_API_KEY: "o-key" };
const 요청 = (name: string) => ({ name, prompt: "기획해 주세요", schema: { type: "object" } });

/** 신호가 끊길 때까지 답하지 않는다 — SDK 의 제한 시간이 끊는다. */
const hang = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("This operation was aborted", "AbortError")));
  });

const claudeReply = (name: string) =>
  new Response(
    JSON.stringify({
      id: "msg_1", type: "message", role: "assistant", model: "m", stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "t1", name, input: { from: "claude" } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const busy = (status: number) =>
  new Response(JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "busy" } }), {
    status,
    headers: { "content-type": "application/json", "retry-after-ms": "1" },
  });

let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  openaiCalls.length = 0;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const { createPdpLlm } = await import("../providers");

/** 제한 시간(120초)과 SDK 의 재시도 대기를 넉넉히 넘길 때까지 시계를 돌린다. */
async function runPastTimeouts<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  for (let i = 0; i < 8; i += 1) await vi.advanceTimersByTimeAsync(130_000);
  const outcome = await settled;
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

describe("시간 초과", () => {
  it.each(["pdp_blueprint", "pdp_brief", "pdp_review", "pdp_qa"])(
    "%s 는 한 번만 기다리고 바로 예비로 넘어간다",
    async (name) => {
      vi.useFakeTimers();
      fetchMock.mockImplementation(hang);
      const result = await runPastTimeouts(createPdpLlm(환경).generate(요청(name)));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(openaiCalls).toHaveLength(1);
      expect(JSON.parse(result.text)).toEqual({ from: "openai" });
      expect(result.execution).toMatchObject({ provider: "openai", fallbackReason: "timeout" });
      expect(warn.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n")).toContain("기획 시간 초과 → 예비");
    },
  );

  it("인물 대조(reference)는 이번 범위가 아니다 — 지금처럼 SDK 가 다시 기다린다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hang);
    await runPastTimeouts(createPdpLlm(환경).generate(요청("pdp_person_check")));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(openaiCalls).toHaveLength(1);
  });
});

describe("과부하는 지금처럼", () => {
  it.each([429, 529])("%s 는 SDK 가 다시 불러 Claude 답을 쓴다", async (status) => {
    fetchMock.mockResolvedValueOnce(busy(status)).mockResolvedValueOnce(claudeReply("pdp_blueprint"));
    const result = await createPdpLlm(환경).generate(요청("pdp_blueprint"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(openaiCalls).toHaveLength(0);
    expect(JSON.parse(result.text)).toEqual({ from: "claude" });
  });

  it("계속 과부하면 세 번 부른 뒤 예비로 — 사유는 지금처럼 상태 번호다", async () => {
    fetchMock.mockImplementation(async () => busy(529));
    const result = await createPdpLlm(환경).generate(요청("pdp_blueprint"));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.execution).toMatchObject({ provider: "openai", fallbackReason: "provider_529" });
  });

  it("연결 실패(시간 초과 아님)도 지금처럼 다시 부른다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(claudeReply("pdp_blueprint"));
    const result = await createPdpLlm(환경).generate(요청("pdp_blueprint"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(result.text)).toEqual({ from: "claude" });
  });
});
