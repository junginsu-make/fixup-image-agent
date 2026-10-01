import { createFalClient, type FalClient } from "@fal-ai/client";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { recordAiCost } from "../llm/meter";

export type FalJobStatus = "queued" | "in_progress" | "completed";

export interface FalQueueClient {
  submitJob(endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }>;
  jobStatus(endpoint: string, requestId: string): Promise<FalJobStatus>;
  jobResult(endpoint: string, requestId: string): Promise<{ images: Array<{ url: string }> }>;
}

type FalClientFactory = (config: { credentials: string; retry: { maxRetries: number } }) => Pick<FalClient, "queue">;

/**
 * 엔드포인트 → 단가표(`model_prices`)의 모델 id. 모르는 엔드포인트면 그대로 넘긴다 —
 * DB 가 「단가 없음」으로 보고 가장 비싼 값으로 잡는다(`estimate`).
 */
export function falModelIdFor(endpoint: string): string {
  return IMAGE_MODELS.find((model) => model.t2i.endpoint === endpoint || model.i2i.endpoint === endpoint)?.id ?? endpoint;
}

/** 이번 제출이 요청한 장수. 포스터는 변형 수(`num_images`), 카드뉴스는 1. */
function requestedImages(input: Record<string, unknown>): number {
  const count = Number(input.num_images);
  return Number.isInteger(count) && count > 0 ? Math.min(count, 100) : 1;
}

/** 모델 도메인과 무관한 fal queue 제출·조회 계약. */
export function createFalQueueClient(
  apiKey: string,
  factory: FalClientFactory = createFalClient,
): FalQueueClient {
  const client = factory({ credentials: apiKey, retry: { maxRetries: 0 } });
  return {
    async submitJob(endpoint, input) {
      const submitted = await client.queue.submit(endpoint as never, { input } as never);
      /*
        **제출하는 자리에서 적는다**(설계 §3.4). fal 큐는 제출하면 과금이 끝난다
        (`lib/poster/flow.ts` 「이 줄부터는 돈이 이미 나갔다」). 상태 조회는 여러 번 오거나
        아예 안 올 수 있어 거기서 적지 않는다. 요청 id 가 표에서 unique 라 두 번 안 적힌다.
      */
      recordAiCost({
        provider: "fal",
        model: falModelIdFor(endpoint),
        images: requestedImages(input),
        basis: "image_unit",
        falRequestId: submitted.request_id,
      });
      return { requestId: submitted.request_id };
    },
    async jobStatus(endpoint, requestId) {
      const status = await client.queue.status(endpoint, { requestId, logs: true });
      if (status.status === "IN_QUEUE") return "queued";
      if (status.status === "IN_PROGRESS") return "in_progress";
      return "completed";
    },
    async jobResult(endpoint, requestId) {
      const result = await client.queue.result(endpoint as never, { requestId });
      const data = result.data as { images?: Array<{ url?: string }> };
      return {
        images: (data.images ?? []).flatMap((image) => image.url ? [{ url: image.url }] : []),
      };
    },
  };
}
