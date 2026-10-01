import { STATUS_CODES } from "node:http";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { FalHttpError, falQueueOps, type FalQueueOps } from "./http";
import { defaultFalRouter } from "./pool/default";
import type { FalRouter } from "./route";

export type FalJobStatus = "queued" | "in_progress" | "completed";

export interface FalQueueClient {
  submitJob(endpoint: string, input: Record<string, unknown>): Promise<{ requestId: string }>;
  jobStatus(endpoint: string, requestId: string): Promise<FalJobStatus>;
  jobResult(endpoint: string, requestId: string): Promise<{ images: Array<{ url: string }> }>;
}

/**
 * fal 원문을 화면에 그대로 보여주지 않는다(fix round 1, 2026-10-01 리뷰).
 *
 * 제출을 `@fal-ai/client` 에서 손으로 보내는 `submitFalQueue`(`http.ts`)로 옮기면서 실패 때
 * `error.message` 가 fal 원문(최대 300자, 계정 잠김 사유 등 고객에게 보이면 안 되는 말이 섞일 수
 * 있다)으로 바뀌었다. 카드뉴스 라우트(`app/api/sns/.../generate/route.ts`)는 이 `message` 를 그대로
 * 사용자에게 보여준다 — 예전 SDK 가 던지던 모양(`body.message` 있으면 그 말, 없으면 HTTP 사유 문구)으로
 * 되돌린다. `status`·`body` 는 그대로 가진다 — `classifyFalFailure` 는 `status` 만 보고, 운영자는
 * `body` 로 fal 기록을 찾는다.
 */
export class FalQueueFailure extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(sdkShapedMessage(status, body));
    this.name = "FalQueueFailure";
  }
}

function sdkShapedMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
  } catch {
    // JSON 이 아니면 아래 기본 문구로.
  }
  return STATUS_CODES[status] ?? `HTTP ${status}`;
}

/** `FalHttpError` 만 SDK 모양으로 바꾼다. 그 밖(`FalPoolBusyError` 등 한국어 메시지)은 그대로 넘긴다. */
function asSdkShapedFailure(error: unknown): unknown {
  return error instanceof FalHttpError ? new FalQueueFailure(error.status, error.body) : error;
}

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

/**
 * 모델 도메인과 무관한 fal queue 제출·조회 계약(포스터·카드뉴스).
 *
 * **어느 계정으로 보낼지·물을지는 `router` 가 정한다**(S3b). 제출은 켜진 계정 중 여유가 가장 큰 곳으로,
 * 상태·결과는 그 요청을 보낸 계정의 키로 묻는다. 카드뉴스·포스터 기록에는 계정 칸이 없어도 된다 —
 * fal 요청 번호로 찾는다(`fal_requests`). 비용 한 줄은 제출 자리(`lib/fal/http.ts`)에서 쓴다.
 */
export function createFalQueueClient(
  router: FalRouter = defaultFalRouter(),
  opsFor: (key: string) => FalQueueOps = falQueueOps,
): FalQueueClient {
  return {
    async submitJob(endpoint, input) {
      try {
        const { requestId } = await router.submit(endpoint, input, {
          cost: { model: falModelIdFor(endpoint), images: requestedImages(input) },
        });
        return { requestId };
      } catch (error) {
        throw asSdkShapedFailure(error);
      }
    },
    async jobStatus(endpoint, requestId) {
      const route = await router.routeOf(requestId);
      let status: FalJobStatus;
      try {
        status = await opsFor(route.key).status(endpoint, requestId);
      } catch (error) {
        throw asSdkShapedFailure(error);
      }
      // 끝났으면 계정의 진행 중 수에서 뺀다. 결과 받기는 그 뒤에 와도 같은 키를 쓴다.
      if (status === "completed") router.finished(requestId);
      return status;
    },
    async jobResult(endpoint, requestId) {
      const route = await router.routeOf(requestId);
      let data: { images?: Array<{ url?: string }> } | null;
      try {
        data = (await opsFor(route.key).result(endpoint, requestId)) as { images?: Array<{ url?: string }> } | null;
      } catch (error) {
        throw asSdkShapedFailure(error);
      }
      return {
        images: (data?.images ?? []).flatMap((image) => image.url ? [{ url: image.url }] : []),
      };
    },
  };
}
