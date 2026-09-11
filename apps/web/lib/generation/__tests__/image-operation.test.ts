import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
vi.mock("server-only", () => ({}));
const failures = vi.hoisted(() => ({ settlement: false, ready: false }));
vi.mock("../run-store", async () => {
  const actual = await vi.importActual<typeof import("../run-store")>("../run-store");
  return { ...actual, executionStore: (run: Parameters<typeof actual.executionStore>[0]) => {
    const store = actual.executionStore(run);
    return { ...store,
      advance: async (id: string, patch: Parameters<typeof store.advance>[1]) => { if (failures.ready && patch.state === "result_ready") throw new Error("database down"); return store.advance(id, patch); },
      settle: async () => { if (failures.settlement) throw new Error("database down"); return store.settle(); } };
  } };
});
import { runImageOperation } from "../image-operation";
import { createPdpImageGenerator, quotePdpImage } from "../../pdp/fal";
import { getLocalDatabase } from "../../local-store";
import { localLedger } from "../local-ledger";
let root: string;
let parent: string;
let paid: number;
let downloads: number;
let downloadFails: boolean;
beforeEach(async () => {
  parent = await realpath(tmpdir()); root = await mkdtemp(path.join(parent, "fixup-sync-image-"));
  vi.stubEnv("LOCAL_STORE", "1"); vi.stubEnv("LOCAL_STORE_ROOT", root); vi.stubEnv("GENERATION_EXECUTION_V2", "1");
  failures.settlement = false; failures.ready = false; paid = 0; downloads = 0; downloadFails = false;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url.startsWith("https://fal.run/")) { paid++; return Response.json({ images: [{ url: "https://example.invalid/result.png", content_type: "image/png" }] }); }
    if (url === "https://example.invalid/result.png") { downloads++; if (downloadFails) throw new Error("download unavailable"); return new Response(new Uint8Array([1, 2, 3])); }
    throw new Error("Unexpected network request");
  });
});
afterEach(async () => {
  vi.unstubAllGlobals(); vi.unstubAllEnvs();
  const target = await realpath(root);
  if (path.dirname(target) !== parent || !path.basename(target).startsWith("fixup-sync-image-")) throw new Error("Unexpected cleanup target");
  await rm(target, { recursive: true });
});
function execution(key: string) {
  const input = { prompt: "product", systemPrompt: "", aspectRatio: "1:1" as const, references: [] };
  const model = "gpt-image-2" as const;
  const price = quotePdpImage(model, input);
  const request = new Request("https://example.invalid/api/images", { method: "POST", headers: { "x-generation-protocol": "2", "x-idempotency-key": key } });
  return () => runImageOperation(request, "owner", { operation: "pdp_image", units: Math.ceil(price / 50000), identity: input,
    models: [model], maximumImages: 1, maximumImageCostMicrousd: price, maximumLlmCalls: 0 }, async () => {
    const image = await createPdpImageGenerator({ FAL_KEY: "fake" })(model, input);
    return { value: { imageBase64: image.base64, mimeType: image.mimeType }, images: [image], success: true };
  });
}
it("preserves output through a settlement outage and charges the model price exactly once", async () => {
  const key = randomUUID(); const call = execution(key); failures.settlement = true;
  const result = await call();
  expect((await localLedger().existing("owner", key))?.state).toBe("settlement_pending");
  failures.settlement = false;
  // A live lease must not be stolen by a concurrent replay, even for settlement.
  expect(await call()).toEqual(result);
  await getLocalDatabase().update(data => {
    for (const run of (data as unknown as { generationRuns: Array<{ lease_until: string }> }).generationRuns) run.lease_until = "2000-01-01T00:00:00Z";
  });
  expect(await call()).toEqual(result);
  const run = await localLedger().existing("owner", key);
  expect(run?.state).toBe("succeeded"); expect(run?.consumed_units).toBeGreaterThan(1);
  expect(await call()).toEqual(result); expect(paid).toBe(1); expect(downloads).toBe(1);
});
it("reopens an expired execution and retries download without another provider submission", async () => {
  const key = randomUUID(); const call = execution(key); downloadFails = true;
  await expect(call()).rejects.toThrow();
  await getLocalDatabase().update(data => {
    for (const run of (data as unknown as { generationRuns: Array<{ lease_until: string }> }).generationRuns) run.lease_until = "2000-01-01T00:00:00Z";
  });
  downloadFails = false;
  expect((await call()).imageBase64).toBe("AQID");
  expect(paid).toBe(1); expect(downloads).toBe(2);
  expect((await localLedger().existing("owner", key))?.state).toBe("succeeded");
});
it("returns the stored image and repairs the raw-response DB write without recreating it", async () => {
  const key = randomUUID(); const call = execution(key); failures.ready = true;
  expect((await call()).imageBase64).toBe("AQID");
  await getLocalDatabase().update(data => {
    for (const run of (data as unknown as { generationRuns: Array<{ lease_until: string }> }).generationRuns) run.lease_until = "2000-01-01T00:00:00Z";
  });
  failures.ready = false;
  expect((await call()).imageBase64).toBe("AQID");
  expect(paid).toBe(1); expect(downloads).toBe(1);
  expect((await localLedger().existing("owner", key))?.state).toBe("succeeded");
});
