import { ApiError, createFalClient, type FalClient } from "@fal-ai/client";
import { boundedProviderFetch } from "../generation/deadline";

export type FalJobStatus = "queued" | "in_progress" | "completed";

export interface FalQueueClient {
  submitJob(endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }>;
  jobStatus(endpoint: string, requestId: string): Promise<FalJobStatus>;
  jobResult(endpoint: string, requestId: string): Promise<{ images: Array<{ url: string }>; failed?: boolean }>;
}

type FalClientFactory = (config: { credentials: string; retry: { maxRetries: number }; fetch: typeof fetch }) => Pick<FalClient, "queue">;

/** 모델 도메인과 무관한 fal queue 제출·조회 계약. */
export function createFalQueueClient(
  apiKey: string,
  factory: FalClientFactory = createFalClient,
): FalQueueClient {
  const client = factory({ credentials: apiKey, retry: { maxRetries: 0 }, fetch: boundedProviderFetch });
  return {
    async submitJob(endpoint, input) {
      const submitted = await client.queue.submit(endpoint as never, { input } as never);
      return { requestId: submitted.request_id };
    },
    async jobStatus(endpoint, requestId) {
      const status = await client.queue.status(endpoint, { requestId, logs: true });
      if (status.status === "IN_QUEUE") return "queued";
      if (status.status === "IN_PROGRESS") return "in_progress";
      return "completed";
    },
    async jobResult(endpoint, requestId) {
      let result;
      try { result = await client.queue.result(endpoint as never, { requestId }); }
      catch (error) {
        if (error instanceof ApiError && error.status === 422) return { images: [], failed: true };
        throw error;
      }
      const data = result.data as { images?: Array<{ url?: string }>; error?: unknown };
      if (data.error) return { images: [], failed: true };
      return {
        images: (data.images ?? []).flatMap((image) => image.url ? [{ url: image.url }] : []),
      };
    },
  };
}
