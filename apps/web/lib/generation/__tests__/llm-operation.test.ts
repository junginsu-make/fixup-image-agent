import { beforeEach, expect, it, vi } from "vitest";
import type { ExecutionStore, GenerationAttempt, GenerationRun } from "../types";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  run: undefined as GenerationRun | undefined,
  cached: undefined as unknown,
  attempts: [] as GenerationAttempt[],
  duplicate: false,
  settlementDown: false,
  store: undefined as ExecutionStore | undefined,
  settlements: 0,
}));
vi.mock("../run-store", () => ({
  useDurableGeneration: () => true,
  requestKey: () => "request-key",
  inputHash: (value: unknown) => JSON.stringify(value),
  existingRun: async () => state.duplicate ? null : state.run,
  beginRun: async () => {
    state.run ??= { id: "run", user_id: "owner", state: "running", lease_token: "lease", checkpoint: {} } as GenerationRun;
    return state.duplicate ? { ...state.run, lease_token: null } : state.run;
  },
  executionStore: () => state.store,
  claimRun: async () => state.run,
  renewRun: async () => {},
}));
vi.mock("../result-cache", () => ({
  readCachedResult: async () => state.cached,
  writeCachedResult: async (_run: unknown, value: unknown) => { state.cached = value; return "owner/run/result.json"; },
}));
import { runLlmOperation } from "../llm-operation";
import { recordedLlmCall, withRecordedLlm } from "../../llm/recorded-call";
const request = new Request("https://example.invalid/api/plan");
const options = { operation: "sns_plan" as const, identity: { text: "hello" }, models: ["gpt-5.5"], maxCalls: 1 };
beforeEach(() => {
  state.run = undefined; state.cached = undefined; state.attempts = [];
  state.duplicate = false; state.settlementDown = false; state.settlements = 0;
  state.store = {
    attempts: async () => structuredClone(state.attempts),
    prepare: async spec => {
      const attempt = { id: `attempt-${state.attempts.length}`, logical_step: spec.step, state: "prepared" } as GenerationAttempt;
      state.attempts.push(attempt); return attempt;
    },
    advance: async (id, patch) => {
      const attempt = state.attempts.find(a => a.id === id)!;
      Object.assign(attempt, { state: patch.state,
        ...(patch.output !== undefined ? { output_manifest: patch.output } : {}),
        ...(patch.costMicrousd !== undefined ? { measured_cost_microusd: patch.costMicrousd } : {}),
      });
      return attempt;
    },
    checkpoint: async (data, status) => { Object.assign(state.run!, { checkpoint: data, state: status }); return state.run!; },
    persist: async () => state.run!,
    settle: async () => {
      if (state.settlementDown) throw new Error("database unavailable");
      state.settlements++; state.run!.state = state.run!.checkpoint.businessSuccess === false ? "failed" : "succeeded";
      return state.run!;
    },
  };
});
it("replays a cached response without calling the provider or settling twice", async () => {
  const provider = vi.fn(async () => ({ output_text: "answer", usage: { input_tokens: 10, output_tokens: 2 } }));
  const call = () => recordedLlmCall("openai", "gpt-5.5", { input: "hello" }, provider);
  const first = await runLlmOperation(request, "owner", options, call);
  expect(await runLlmOperation(request, "owner", options, call)).toEqual(first);
  expect(provider).toHaveBeenCalledTimes(1); expect(state.settlements).toBe(1);
});
it("a racing duplicate does not inherit the original inline lease", async () => {
  state.duplicate = true;
  const call = vi.fn();
  await expect(runLlmOperation(request, "owner", options, call)).rejects.toThrow("concurrent_limit");
  expect(call).not.toHaveBeenCalled();
});
it("allows a legitimate empty result to fail without an unmetered success", async () => {
  await expect(runLlmOperation(request, "owner", { ...options, isSuccess: () => false }, async () => [])).resolves.toEqual([]);
  expect(state.run!.state).toBe("failed"); expect(state.attempts).toHaveLength(0);
});
it("keeps a completed response available while settlement is down and repairs later", async () => {
  state.settlementDown = true;
  const provider = vi.fn(async () => ({ usage: { input_tokens: 10, output_tokens: 2 }, output_text: "saved" }));
  const call = () => recordedLlmCall("openai", "gpt-5.5", {}, provider);
  const first = await runLlmOperation(request, "owner", options, call);
  expect(state.run!.state).toBe("settlement_pending");
  await expect(runLlmOperation(request, "owner", options, call)).resolves.toEqual(first);
  state.settlementDown = false;
  await expect(runLlmOperation(request, "owner", options, call)).resolves.toEqual(first);
  expect(provider).toHaveBeenCalledTimes(1); expect(state.settlements).toBe(1);
});
it("retains an uncertain paid call and never retries it on request replay", async () => {
  const provider = vi.fn(async () => { throw new Error("connection reset after send"); });
  const call = () => recordedLlmCall("openai", "gpt-5.5", {}, provider);
  await expect(runLlmOperation(request, "owner", options, call)).rejects.toThrow();
  await expect(runLlmOperation(request, "owner", options, call)).rejects.toThrow();
  expect(provider).toHaveBeenCalledTimes(1); expect(state.attempts[0].state).toBe("unknown");
  expect(state.settlements).toBe(0);
});
it("counts built-in search calls from the raw SDK response", async () => {
  await runLlmOperation(request, "owner", { ...options, maxToolCalls: 3 }, () =>
    recordedLlmCall("openai", "gpt-5.5", { max_tool_calls: 3 }, async () => ({
      usage: { input_tokens: 0, output_tokens: 0 },
      output: [{ type: "web_search_call" }, { type: "message" }, { type: "web_search_call" }],
    })));
  expect(state.attempts[0].measured_cost_microusd).toBe(20_000);
});
it("blocks another paid call once the operation call allowance is exhausted", async () => {
  const provider = vi.fn(async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }));
  await expect(runLlmOperation(request, "owner", options, async () => {
    await recordedLlmCall("openai", "gpt-5.5", {}, provider);
    return recordedLlmCall("openai", "gpt-5.5", {}, provider);
  })).rejects.toThrow();
  expect(provider).toHaveBeenCalledTimes(1);
});
it("blocks later provider calls even if a domain helper swallows an uncertain error", async () => {
  const uncertain = vi.fn(async () => { throw new Error("socket reset after send"); });
  const later = vi.fn(async () => ({ usage: { input_tokens: 1, output_tokens: 1 } }));
  await expect(runLlmOperation(request, "owner", { ...options, maxCalls: 2 }, async () => {
    try { await recordedLlmCall("openai", "gpt-5.5", { input: "first" }, uncertain); } catch { /* legacy optional analysis */ }
    return recordedLlmCall("openai", "gpt-5.5", { input: "second" }, later);
  })).rejects.toThrow();
  expect(uncertain).toHaveBeenCalledTimes(1); expect(later).not.toHaveBeenCalled();
});
it("replays each section's own LLM response when parallel completion order changes", async () => {
  const provider = vi.fn(async (section: string) => ({ section, usage: { input_tokens: 1, output_tokens: 1 } }));
  const call = (section: string) => recordedLlmCall("openai", "gpt-5.5", { section }, () => provider(section));
  await withRecordedLlm(state.store!, "batch", async () => Promise.all([call("A"), call("B")]), 2);
  const replayed = await withRecordedLlm(state.store!, "batch", async () => Promise.all([call("B"), call("A")]), 2);
  expect(replayed.map(v => v.section)).toEqual(["B", "A"]);
  expect(provider).toHaveBeenCalledTimes(2);
});
