import { beforeEach, expect, it, vi } from "vitest";
import type { ExecutionStore, GenerationAttempt, GenerationRun } from "../types";
vi.mock("server-only", () => ({}));
const cache = vi.hoisted(() => new Map<string, unknown>());
vi.mock("../run-store", () => ({ inputHash: (v: unknown) => JSON.stringify(v) }));
vi.mock("../result-cache", () => ({
  writeCachedResult: async (_r: unknown, value: unknown, name: string) => { cache.set(name, structuredClone(value)); return name; },
  readCachedResult: async (_r: unknown, name: string) => cache.get(name),
}));
import { recordedImageCall, withRecordedImages, finalizeImageArtifacts } from "../recorded-image";
let attempts: GenerationAttempt[];
let store: ExecutionStore;
let failReady: boolean;
const run = { id: "run", user_id: "owner" } as GenerationRun;
const meta = { provider: "fal", model: "model", endpoint: "fal/test", identity: { prompt: "hello" }, price: { providerUnitMicrousd: 50000, chargeUnitMicrousd: 50000 } };
beforeEach(() => {
  cache.clear(); attempts = []; failReady = false;
  store = {
    attempts: async () => structuredClone(attempts),
    prepare: async spec => {
      const a = { id: `a${attempts.length}`, state: "prepared", logical_step: spec.step, endpoint: spec.endpoint, price_snapshot: spec.price } as GenerationAttempt;
      attempts.push(a); return structuredClone(a);
    },
    advance: async (id, patch) => {
      if (failReady && patch.state === "result_ready") throw new Error("database down");
      const a = attempts.find(a => a.id === id)!;
      Object.assign(a, { state: patch.state, ...(patch.output ? { output_manifest: patch.output } : {}), ...(patch.deliveredImages !== undefined ? { delivered_images: patch.deliveredImages } : {}) });
      return structuredClone(a);
    },
  } as ExecutionStore;
});
it("stores the raw provider response before downloading and replays without another paid call", async () => {
  const submit = vi.fn(async () => ({ url: "https://example.invalid/image" }));
  const download = vi.fn(async () => {
    expect(cache.has("a0-provider")).toBe(true);
    return { base64: "image", mimeType: "image/png" };
  });
  const call = () => recordedImageCall(meta, submit, download);
  await withRecordedImages(run, store, 1, call);
  await withRecordedImages(run, store, 1, call);
  expect(submit).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledTimes(1);
});
it("retries only image download after the raw response was preserved", async () => {
  const submit = vi.fn(async () => ({ url: "https://example.invalid/image" }));
  const download = vi.fn().mockRejectedValueOnce(new Error("storage interrupted")).mockResolvedValue({ base64: "image", mimeType: "image/png" });
  const call = () => recordedImageCall(meta, submit, download);
  await expect(withRecordedImages(run, store, 1, call)).rejects.toThrow();
  expect(attempts[0].state).toBe("result_ready");
  await withRecordedImages(run, store, 1, call);
  expect(submit).toHaveBeenCalledTimes(1); expect(download).toHaveBeenCalledTimes(2);
});
it("recovers a cached provider response when the following DB write failed", async () => {
  failReady = true;
  const submit = vi.fn(async () => ({ url: "https://example.invalid/image" }));
  const call = () => recordedImageCall(meta, submit, async () => ({ base64: "image", mimeType: "image/png" }));
  await expect(withRecordedImages(run, store, 1, call)).resolves.toEqual({ base64: "image", mimeType: "image/png" });
  expect(attempts[0].state).toBe("submitting");
  failReady = false;
  await withRecordedImages(run, store, 1, call);
  expect(submit).toHaveBeenCalledTimes(1); expect(attempts[0].state).toBe("result_ready");
});
it("charges only the delivered image and preserves a discarded QA attempt without charging it", async () => {
  await withRecordedImages(run, store, 2, async () => {
    await recordedImageCall(meta, async () => ({}), async () => ({ base64: "discarded", mimeType: "image/png" }));
    await recordedImageCall(meta, async () => ({}), async () => ({ base64: "delivered", mimeType: "image/png" }));
  });
  await finalizeImageArtifacts(run, store, [JSON.stringify("delivered")]);
  expect(attempts.map(a => a.delivered_images)).toEqual([0, 1]);
  await finalizeImageArtifacts(run, store, [JSON.stringify("delivered")]);
  expect(attempts.map(a => a.delivered_images)).toEqual([0, 1]);
});
it("does not retry an ambiguous provider submission", async () => {
  const submit = vi.fn(async () => { throw new Error("socket reset after send"); });
  const call = () => recordedImageCall(meta, submit, async () => ({ base64: "image", mimeType: "image/png" }));
  await expect(withRecordedImages(run, store, 1, call)).rejects.toThrow();
  await expect(withRecordedImages(run, store, 1, call)).rejects.toThrow();
  expect(submit).toHaveBeenCalledTimes(1); expect(attempts[0].state).toBe("unknown");
});
