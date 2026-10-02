import { describe, expect, it, vi } from "vitest";
import { createPoolRouter, FalPoolUnavailableError } from "../router";
import { sealFalKey } from "../key-crypto";
import { createFalQueueClient } from "../../queue";
import { envFalRouter } from "../../route";
import { classifyFalFailure } from "../../failure";
import type { FalPoolStore } from "../store";
import { isFalReceipt, falProviderRequestId } from "../../request-id";
import { sealFalReceipt } from "../receipt";
import { runFalQueued } from "../../run";
import { toAiCostRow } from "../../../ai-cost/write";

const A = "a1000000-0000-4000-8000-00000000000a";
const master = Buffer.alloc(32, 5);
function fixture() {
  const sealed = sealFalKey(master, A, "pool-key");
  let bound: string | null = null, claimed = false, finished = false;
  const store: FalPoolStore = {
    liveAccounts: vi.fn(async () => [{ id: A, name: "A", enabled: true, state: "ok" as const, key_ciphertext: sealed.ciphertext, key_iv: sealed.iv, key_tag: sealed.tag }]),
    claim: vi.fn(async () => claimed && !finished ? null : (claimed = true, { accountId: A, slotId: 1 })),
    bind: vi.fn(async (_slot, id) => { bound = id; }),
    release: vi.fn(async () => { if (!bound) claimed = false; }),
    finish: vi.fn(async id => { if (bound === id) finished = true; }),
    accountOf: vi.fn(async id => id === bound ? A : null),
    mark: vi.fn(async () => false),
  };
  const submit = vi.fn(async () => "provider-1");
  const make = () => createPoolRouter({ store, masterKey: master, environment: { FAL_KEY: "different-account-key" }, alert: () => {}, submit, log: () => {} });
  return { store, submit, make, open: () => claimed && !finished };
}

describe("accepted fal requests survive mapping faults", () => {
  it("keeps the existing provider ID on a confirmed normal bind", async () => {
    const f = fixture();
    expect((await f.make().submit("fal-ai/test", {})).requestId).toBe("provider-1");
    expect(await f.make().routeOf("provider-1")).toEqual({ accountId: A, key: "pool-key" });
  });
  it("can recover the original account after all bind attempts fail and the process restarts", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const accepted = await f.make().submit("fal-ai/test", {});
    expect(isFalReceipt(accepted.requestId)).toBe(true);
    const recovered = await f.make().routeOf(accepted.requestId);
    expect(recovered).toEqual({ accountId: A, key: "pool-key" });
    expect(f.submit).toHaveBeenCalledTimes(1);
  });
  it("does not guess an environment account on a cold account-list failure", async () => {
    const f = fixture(); await f.make().submit("fal-ai/test", {});
    vi.mocked(f.store.liveAccounts).mockRejectedValue(new Error("read outage"));
    await expect(f.make().routeOf("provider-1")).rejects.toBeInstanceOf(FalPoolUnavailableError);
  });
  it("frees the claimed slot even if a completed job could not be bound", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const accepted = await f.make().submit("fal-ai/test", {});
    await f.make().finished(accepted.requestId);
    expect(f.open()).toBe(false);
    await expect(f.make().submit("fal-ai/test", {})).resolves.toBeDefined();
  });
  it("passes the raw provider ID to HTTP, never the recovery receipt", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const accepted = await f.make().submit("fal-ai/test", {});
    const status = vi.fn(async () => "completed" as const), result = vi.fn(async () => ({ images: [] }));
    const client = createFalQueueClient(f.make(), key => {
      expect(key).toBe("pool-key"); return { status, result, cancel: async () => {} };
    });
    await client.jobStatus("fal-ai/test", accepted.requestId);
    await client.jobResult("fal-ai/test", accepted.requestId);
    expect(status).toHaveBeenCalledWith("fal-ai/test", "provider-1");
    expect(result).toHaveBeenCalledWith("fal-ai/test", "provider-1");
  });
  it("does not use an environment key, refund or query the provider for a tampered receipt", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const accepted = await f.make().submit("fal-ai/test", {});
    const altered = accepted.requestId.slice(0, -1) + (accepted.requestId.endsWith("A") ? "B" : "A");
    for (const router of [f.make(), envFalRouter({ FAL_KEY: "wrong-key" })]) {
      for (const id of [altered, "fxfal1.malformed.x"]) {
        const error = await router.routeOf(id).catch(e => e);
        expect(error).toBeInstanceOf(Error);
        expect(classifyFalFailure(error).releaseReservation).toBe(false);
      }
    }
    await expect(envFalRouter({ FAL_KEY: "wrong-key" }).routeOf(accepted.requestId)).rejects.toThrow();
  });
  it("requires the original server signing key after a restart", async () => {
    const f = fixture();
    const receipt = sealFalReceipt(Buffer.alloc(32, 8), { accountId: A, slotId: 1, requestId: "provider-1" });
    await expect(f.make().routeOf(receipt)).rejects.toThrow();
    expect(f.store.accountOf).not.toHaveBeenCalled();
  });
  it("keeps one canonical provider cost ID for accepted jobs and later receipt-based reporting", () => {
    const id = sealFalReceipt(master, { accountId: A, slotId: 1, requestId: "provider-1" });
    const cost = { provider: "fal" as const, model: "model", images: 1, basis: "image_unit" as const };
    expect(toAiCostRow(undefined, { ...cost, falRequestId: id })).toEqual(toAiCostRow(undefined, { ...cost, falRequestId: "provider-1" }));
  });
  it("can finish synchronous jobs using the actual provider ID", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const result = vi.fn(async () => ({ images: [] }));
    const status = vi.fn(async () => "completed" as const);
    const done = await runFalQueued(f.make(), { endpoint: "fal-ai/test", input: {} }, { opsFor: () => ({ status, result, cancel: async () => {} }) });
    expect(isFalReceipt(done.requestId)).toBe(true);
    expect(result).toHaveBeenCalledWith("fal-ai/test", "provider-1");
    expect(f.open()).toBe(false);
  });
  it("cancels the actual provider request at the deadline, not its recovery receipt", async () => {
    const f = fixture(); vi.mocked(f.store.bind).mockRejectedValue(new Error("DB bind down"));
    const cancel = vi.fn(async () => {});
    const error = await runFalQueued(f.make(), { endpoint: "fal-ai/test", input: {}, deadlineMs: 0 }, {
      now: () => 0, opsFor: () => ({ status: async () => "queued", result: async () => ({}), cancel }),
    }).catch(e => e);
    expect(isFalReceipt(error.requestId)).toBe(true);
    expect(falProviderRequestId(error.requestId)).toBe("provider-1");
    expect(cancel).toHaveBeenCalledWith("fal-ai/test", "provider-1");
    expect(f.open()).toBe(false);
  });
  it("retries failed cleanup before claiming another slot without discarding a completed result", async () => {
    const f = fixture(), router = f.make(); await router.submit("fal-ai/test", {});
    vi.mocked(f.store.finish).mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary")).mockRejectedValueOnce(new Error("temporary"));
    await expect(router.finished("provider-1")).resolves.toBeUndefined();
    expect(f.open()).toBe(true);
    await expect(router.submit("fal-ai/test", {})).resolves.toBeDefined();
  });
});
