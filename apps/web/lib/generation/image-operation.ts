import "server-only";
import { ExecutionControlError } from "@fixup/shared";
import { beginRun, claimRun, existingRun, executionStore, inputHash, requestKey, useDurableGeneration as durableGenerationEnabled } from "./run-store";
import { withRunLease } from "./llm-operation";
import { withRecordedLlm, llmCallUpperMicrousd, assertRecordedLlmHealthy } from "../llm/recorded-call";
import { withRecordedImages, finalizeImageArtifacts, assertRecordedImagesHealthy, type RecordedImage } from "./recorded-image";
import { readCachedResult, writeCachedResult } from "./result-cache";
import { isTerminal, type GenerationRun } from "./types";

interface ImageOperationResult<T> { value: T; images: RecordedImage[]; success: boolean }
interface SavedResult<T> { value: T; deliveredDigests: string[]; businessSuccess: boolean }
async function settleSaved<T>(run: GenerationRun, saved: SavedResult<T>) {
  const store = executionStore(run);
  await finalizeImageArtifacts(run, store, saved.deliveredDigests);
  await store.checkpoint({ resultRef: `${run.user_id}/${run.id}/result.json`, businessSuccess: saved.businessSuccess }, "settlement_pending", 0);
  return store.settle();
}
export async function runImageOperation<T>(request: Request, userId: string, options: {
  operation: "pdp_image" | "redesign_generate" | "redesign_edit";
  units: number; identity: unknown; models: string[]; maximumImages: number; maximumImageCostMicrousd: number; maximumLlmCalls: number;
  maximumLlmOutputTokens?: number;
}, call: () => Promise<ImageOperationResult<T>>): Promise<T> {
  if (!durableGenerationEnabled()) return (await call()).value;
  const key = requestKey(request);
  const previous = await existingRun(userId, key, null, options.identity, options.operation);
  let run: GenerationRun;
  if (previous) {
    const saved = await readCachedResult<SavedResult<T>>(previous);
    if (saved) {
      if (!isTerminal(previous.state) && previous.state !== "needs_reconciliation") {
        try { const claimed = await claimRun(previous.id); if (claimed) await settleSaved(claimed, saved); } catch { /* retry settlement later */ }
      }
      return saved.value;
    }
    if (isTerminal(previous.state) || previous.state === "needs_reconciliation") throw new Error("outcome_unknown");
    const claimed = await claimRun(previous.id);
    if (!claimed) throw new Error("concurrent_limit");
    // Provider settings are part of the frozen plan. Do not resume with new settings.
    if (inputHash(claimed.execution_snapshot.models) !== inputHash(options.models)) throw new Error("execution_configuration_changed");
    run = claimed;
  } else {
    const llmMaximum = options.maximumLlmCalls ? Math.max(...options.models.map(m => llmCallUpperMicrousd(m, 9, options.maximumLlmOutputTokens ?? 16384))) * options.maximumLlmCalls : 0;
    run = await beginRun({ userId, key, operation: options.operation, units: options.units, identity: options.identity,
      snapshot: { kind: "sync_image", models: options.models, maximumImages: options.maximumImages, maximumLlmCalls: options.maximumLlmCalls },
      maxCostMicrousd: llmMaximum + options.maximumImages * options.maximumImageCostMicrousd, inline: true });
    if (!run.lease_token) throw new Error("concurrent_limit");
  }
  const store = executionStore(run);
  return withRunLease(run, () => withRecordedLlm(store, "sync", () => withRecordedImages(run, store, options.maximumImages, async () => {
    let result: ImageOperationResult<T>;
    try { result = await call(); }
    catch (error) {
      if (!(error instanceof ExecutionControlError)) {
        const attempts = await store.attempts();
        if (attempts.every(a => ["stored", "failed", "cancelled"].includes(a.state))) {
          await store.checkpoint({ businessSuccess: false }, "settlement_pending", 0);
          await store.settle();
        }
      }
      throw error;
    }
    if (!result.images.length) { assertRecordedLlmHealthy(); assertRecordedImagesHealthy(); }
    if (result.success && !result.images.length) throw new Error("unmetered_image_result");
    const saved: SavedResult<T> = { value: result.value, businessSuccess: result.success, deliveredDigests: result.images.map(image => inputHash(image.base64)) };
    await writeCachedResult(run, saved);
    // If these writes fail, the response and exact delivery set remain available.
    try { await settleSaved(run, saved); } catch { /* the executor/replay completes durable settlement */ }
    return result.value;
  }), options.maximumLlmCalls));
}
