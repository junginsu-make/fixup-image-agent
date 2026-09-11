import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { ExecutionControlError } from "@fixup/shared";
import { inputHash } from "./run-store";
import { readCachedResult, writeCachedResult } from "./result-cache";
import type { ExecutionStore, GenerationRun } from "./types";
import { assertRecordedLlmHealthy, haltRecordedCalls } from "../llm/recorded-call";

export interface RecordedImage { base64: string; mimeType: string }
interface Context {
  run: GenerationRun; store: ExecutionStore; maximumCalls: number;
  calls: number; occurrences: Map<string, number>; halted?: ExecutionControlError;
}
const context = new AsyncLocalStorage<Context>();
export function assertRecordedImagesHealthy() { const halted = context.getStore()?.halted; if (halted) throw halted; }
export async function withRecordedImages<T>(run: GenerationRun, store: ExecutionStore, maximumCalls: number, call: () => Promise<T>) {
  const calls = (await store.attempts()).filter(a => a.endpoint !== "llm").length;
  return context.run({ run, store, maximumCalls, calls, occurrences: new Map() }, call);
}
function halt(current: Context, code: ConstructorParameters<typeof ExecutionControlError>[0]) {
  return current.halted ??= haltRecordedCalls(code);
}
/** Persist the provider response before downloading/converting its image. */
export async function recordedImageCall<Raw, Image extends RecordedImage = RecordedImage>(meta: {
  provider: string; model: string; endpoint: string; identity: unknown;
  price: { providerUnitMicrousd: number; chargeUnitMicrousd: number };
}, submit: () => Promise<Raw>, materialize: (raw: Raw) => Promise<Image>): Promise<Image> {
  const current = context.getStore();
  if (!current) return materialize(await submit());
  assertRecordedLlmHealthy();
  if (current.halted) throw current.halted;
  const hash = inputHash({ provider: meta.provider, model: meta.model, endpoint: meta.endpoint, input: meta.identity });
  const ordinal = current.occurrences.get(hash) ?? 0;
  current.occurrences.set(hash, ordinal + 1);
  const step = `image:${hash}:${ordinal}`;
  let attempt = (await current.store.attempts()).find(a => a.logical_step === step);
  if (attempt?.state === "stored") {
    const cached = await readCachedResult<Image>(current.run, `${attempt.id}-artifact`);
    if (!cached) throw halt(current, "storage_unavailable");
    return cached;
  }
  if (attempt?.state === "result_ready") {
    const cached = await readCachedResult<Image>(current.run, `${attempt.id}-artifact`);
    if (cached) return cached;
  }
  if (attempt?.state === "submitting") {
    const cached = await readCachedResult<{ response: Raw }>(current.run, `${attempt.id}-provider`);
    if (cached) {
      attempt = await current.store.advance(attempt.id, { state: "result_ready", output: { rawRef: `${current.run.user_id}/${current.run.id}/${attempt.id}-provider.json` },
        returnedImages: 1, costMicrousd: attempt.price_snapshot.providerUnitMicrousd, meteringState: "estimated" });
    }
  }
  if (attempt && ["submitting", "submitted", "unknown"].includes(attempt.state)) throw halt(current, "outcome_unknown");
  if (attempt?.state === "failed" || attempt?.state === "cancelled") throw new Error("provider_request_failed");
  if (![meta.price.providerUnitMicrousd, meta.price.chargeUnitMicrousd].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("price_unavailable");
  if (!attempt) {
    if (current.calls >= current.maximumCalls) throw halt(current, "execution_yield");
    current.calls++;
    try {
      attempt = await current.store.prepare({ step, sequence: current.calls, provider: meta.provider, model: meta.model,
        endpoint: meta.endpoint, requestHash: hash, payload: { inputDigest: hash }, price: meta.price,
        maxCostMicrousd: meta.price.providerUnitMicrousd, requestedImages: 1 });
    } catch { throw halt(current, "storage_unavailable"); }
  }
  let raw: Raw;
  if (attempt.state === "result_ready") {
    const cached = await readCachedResult<{ response: Raw }>(current.run, `${attempt.id}-provider`);
    if (!cached) throw halt(current, "storage_unavailable");
    raw = cached.response;
  } else {
    await current.store.advance(attempt.id, { state: "submitting" });
    try { raw = await submit(); }
    catch (error) {
      const status = error && typeof error === "object" && "providerStatus" in error ? Number(error.providerStatus) : 0;
      if ([400, 401, 403, 404, 422, 429].includes(status)) {
        await current.store.advance(attempt.id, { state: "failed", costMicrousd: 0, meteringState: "estimated", errorCode: `provider_${status}` });
        throw error;
      }
      await current.store.advance(attempt.id, { state: "unknown", errorCode: "image_outcome_unknown" });
      throw halt(current, "outcome_unknown");
    }
    let rawRef: string;
    try { rawRef = await writeCachedResult(current.run, { response: raw }, `${attempt.id}-provider`); }
    catch { throw halt(current, "storage_unavailable"); }
    try {
      attempt = await current.store.advance(attempt.id, { state: "result_ready", output: { rawRef },
        returnedImages: 1, costMicrousd: meta.price.providerUnitMicrousd, meteringState: "estimated" });
    } catch {
      // The durable raw response is evidence even if PostgreSQL is down.
      // Finish storing this image, but block further paid calls in this execution.
      halt(current, "storage_unavailable");
    }
  }
  try {
    const image = await materialize(raw);
    if (!image.base64 || !image.mimeType.startsWith("image/")) throw new Error("invalid_image_result");
    await writeCachedResult(current.run, image, `${attempt.id}-artifact`);
    // Delivery is decided only after the route has durably saved its final response.
    return image;
  } catch { throw halt(current, "storage_unavailable"); }
}

export async function finalizeImageArtifacts(run: GenerationRun, store: ExecutionStore, deliveredDigests: string[]) {
  const remaining = new Map<string, number>();
  for (const digest of deliveredDigests) remaining.set(digest, (remaining.get(digest) ?? 0) + 1);
  const attempts = (await store.attempts()).filter(a => a.endpoint !== "llm").reverse();
  for (const attempt of attempts.filter(a => a.state === "stored")) {
    const digest = String(attempt.output_manifest?.imageDigest ?? "");
    remaining.set(digest, Math.max(0, (remaining.get(digest) ?? 0) - attempt.delivered_images));
  }
  for (let attempt of attempts) {
    if (attempt.state === "submitting") {
      const raw = await readCachedResult<{ response: unknown }>(run, `${attempt.id}-provider`);
      if (raw) {
        const cost = attempt.price_snapshot.providerUnitMicrousd;
        if (cost === undefined) throw new Error("price_unavailable");
        attempt = await store.advance(attempt.id, { state: "result_ready", returnedImages: 1, costMicrousd: cost, meteringState: "estimated",
          output: { rawRef: `${run.user_id}/${run.id}/${attempt.id}-provider.json` } });
      }
    }
    if (attempt.state !== "result_ready") continue;
    const image = await readCachedResult<RecordedImage>(run, `${attempt.id}-artifact`);
    if (!image) throw new ExecutionControlError("storage_unavailable");
    const digest = inputHash(image.base64);
    const delivered = (remaining.get(digest) ?? 0) > 0 ? 1 : 0;
    remaining.set(digest, Math.max(0, (remaining.get(digest) ?? 0) - delivered));
    await store.advance(attempt.id, { state: "stored", deliveredImages: delivered,
      output: { ...attempt.output_manifest, imageDigest: digest, artifactRef: `${run.user_id}/${run.id}/${attempt.id}-artifact.json` } });
  }
  if ([...remaining.values()].some(n => n > 0)) throw new Error("unmetered_image_result");
}
