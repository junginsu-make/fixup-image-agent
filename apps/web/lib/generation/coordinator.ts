import type { FalQueueClient } from "../fal/queue";
import type { ExecutionStore, GenerationAttempt } from "./types";
import { assertNewProviderCall } from "./deadline";

/** One durable network/storage step. Calling this again never resubmits a known or ambiguous request. */
export async function advanceQueueAttempt(
  attempt: GenerationAttempt,
  store: Pick<ExecutionStore, "advance" | "accepted">,
  queue: FalQueueClient,
  save: (images: Array<{ url: string }>) => Promise<{ deliveredImages?: number; output?: Record<string, unknown> }>,
): Promise<GenerationAttempt> {
  if (attempt.state === "prepared") {
    assertNewProviderCall(35_000);
    attempt = await store.advance(attempt.id, { state: "submitting" });
    let requestId: string;
    try { ({ requestId } = await queue.submitJob(attempt.endpoint, attempt.request_payload)); }
    catch {
      return store.advance(attempt.id, { state: "unknown", errorCode: "submit_outcome_unknown" });
    }
    try { return await store.advance(attempt.id, { state: "submitted", providerRequestId: requestId }); }
    catch (error) {
      await store.accepted?.(attempt, requestId);
      throw error;
    }
  }
  if (attempt.state === "submitting") {
    // An executor disappeared between the persistent intent and accepted-id write.
    return store.advance(attempt.id, { state: "unknown", errorCode: "submit_outcome_unknown" });
  }
  if (attempt.state === "submitted") {
    if (!attempt.provider_request_id) throw new Error("Stored provider request identity is missing");
    const status = await queue.jobStatus(attempt.endpoint, attempt.provider_request_id);
    if (status !== "completed") return attempt;
    const result = await queue.jobResult(attempt.endpoint, attempt.provider_request_id);
    if (!result.images.length) return store.advance(attempt.id, { state: "failed", errorCode: "no_images", meteringState: "unknown" });
    const unit = attempt.price_snapshot.providerUnitMicrousd;
    return store.advance(attempt.id, {
      state: "result_ready", returnedImages: result.images.length, output: { images: result.images },
      ...(unit === undefined ? { meteringState: "unknown" as const } : { costMicrousd: unit * result.images.length, meteringState: "estimated" as const }),
    });
  }
  if (attempt.state === "result_ready") {
    const images = attempt.output_manifest?.images;
    if (!Array.isArray(images) || images.some(i => typeof i?.url !== "string")) throw new Error("Stored provider output is invalid");
    const saved = await save(images);
    return store.advance(attempt.id, { state: "stored", ...saved });
  }
  return attempt;
}
