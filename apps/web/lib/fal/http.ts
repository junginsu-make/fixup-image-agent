import { createFalClient, type FalClient } from "@fal-ai/client";
import { recordAiCost } from "../llm/meter";

/**
 * fal **대기열(queue)** 에 보내고, 보낸 키로 상태·결과·취소를 묻는다(설계 2026-09-29 §3.3).
 *
 * ── 왜 제출만 손으로 보내나 ─────────────────────────────────────
 *
 * `@fal-ai/client` 의 `queue.submit` 은 429·502·503·504 를 **같은 키로 세 번까지** 다시 보낸다
 * (`src/queue.js` 의 `QUEUE_RETRY_CONFIG`, 호출마다 덮어써서 `retry: { maxRetries: 0 }` 로도 못 끈다).
 * 계정 풀(S3b)은 429·키 오류를 보면 **곧바로 다음 계정**으로 같은 제출을 옮겨야 하므로, 제출만은
 * 상태 코드를 그대로 보는 `fetch` 한 번으로 한다. 지금 동기 경로(`fal.run` 직접 `fetch`)와 같은 모양이다.
 *
 * 상태·결과·취소는 공식 클라이언트에 맡긴다 — 주소 규칙(엔드포인트 뒤 칸이 떨어진다)과 읽기
 * 재시도가 거기 있다. 클라이언트는 **키마다 새로 만든다**(`createFalClient` 는 설정을 인스턴스마다
 * 따로 쥔다, `src/client.js`). 전역 `fal.config` 는 쓰지 않는다 — 동시에 도는 요청끼리 키가 섞인다.
 */

export const FAL_QUEUE_BASE = "https://queue.fal.run";

/** fal 이 준 HTTP 상태를 싣는다. `classifyFalFailure`(`./failure.ts`)가 이 `status` 로 가른다. */
export class FalHttpError extends Error {
  constructor(readonly status: number, readonly body: string, message?: string) {
    super(message ?? `fal responded ${status}: ${body.slice(0, 300)}`);
    this.name = "FalHttpError";
  }
}

/** 제출 한 번의 값. 있으면 제출이 성공한 그 자리에서 비용 한 줄을 쓴다(설계 2026-09-30 §3.4). */
export interface FalSubmitCost {
  /** 단가표(`model_prices`)의 모델 id. */
  model: string;
  images: number;
}

export interface FalSubmitOptions {
  /** fal 쪽에서 처리를 **시작하기까지** 기다릴 상한(초). `x-fal-request-timeout` 로 간다. */
  startTimeoutS?: number;
  cost?: FalSubmitCost;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** 제출하고 fal 요청 번호를 돌려준다. 실패면 `FalHttpError`(상태 코드 그대로). */
export async function submitFalQueue(
  key: string,
  endpoint: string,
  input: Record<string, unknown>,
  options: FalSubmitOptions = {},
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const headers: Record<string, string> = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  if (options.startTimeoutS !== undefined) headers["x-fal-request-timeout"] = String(options.startTimeoutS);

  const response = await fetchImpl(`${FAL_QUEUE_BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  const text = await response.text();
  if (!response.ok) throw new FalHttpError(response.status, text);

  let requestId: unknown;
  try {
    requestId = (JSON.parse(text) as { request_id?: unknown }).request_id;
  } catch {
    requestId = undefined;
  }
  if (typeof requestId !== "string" || !requestId) {
    throw new FalHttpError(502, text, "fal 이 요청 번호를 주지 않았습니다.");
  }

  /*
    **제출하는 자리에서 적는다**(설계 2026-09-30 §3.4·I-9). fal 큐는 제출하면 과금이 끝난다.
    상태 조회는 여러 번 오거나 아예 안 올 수 있어 거기서 적지 않는다. 요청 번호가 표에서 unique 라
    두 번 안 적힌다.
  */
  if (options.cost) {
    recordAiCost({
      provider: "fal",
      model: options.cost.model,
      images: options.cost.images,
      basis: "image_unit",
      falRequestId: requestId,
    });
  }
  return requestId;
}

export type FalQueuePhase = "queued" | "in_progress" | "completed";

/** 한 키로 묻는 상태·결과·취소. */
export interface FalQueueOps {
  status(endpoint: string, requestId: string): Promise<FalQueuePhase>;
  /** 결과 본문(`images`·`image` 등). fal 이 실패로 끝냈으면 상태 코드를 실은 예외를 던진다. */
  result(endpoint: string, requestId: string): Promise<unknown>;
  cancel(endpoint: string, requestId: string): Promise<void>;
}

type ClientFactory = (config: { credentials: string; retry: { maxRetries: number } }) => Pick<FalClient, "queue">;

/**
 * **이미지를 만들지 않고** 키가 살아 있는지 본다(관리자 화면의 등록·「다시 확인」).
 *
 * 없는 요청 번호의 상태를 묻는다. 2026-10-01 실측: 엉터리 키는 `401 {"detail":"invalid key credentials"}`,
 * 모양이 틀린 키·빈 키도 401 이다. 맞는 키는 「그런 요청 없음」(404)을 받는다. 값이 들지 않는다.
 *
 * **한계**: 잔액 소진 잠김은 여기서 안 드러날 수 있다 — 실제 생성에서만 드러난다(설계 §3.3). 화면에 적는다.
 */
export const FAL_KEY_PROBE_URL = `${FAL_QUEUE_BASE}/fal-ai/nano-banana-pro/requests/00000000-0000-4000-8000-000000000000/status`;

export type FalKeyCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable"; status?: number; detail: string };

/** 이 안에 응답이 없으면 포기한다 — 없으면 undici 기본값(약 300초)까지 관리자 화면이 멈춘다. */
const KEY_CHECK_TIMEOUT_MS = 10_000;

export async function checkFalKey(key: string, fetchImpl: FetchLike = fetch): Promise<FalKeyCheck> {
  let response: Response;
  try {
    response = await fetchImpl(FAL_KEY_PROBE_URL, {
      method: "GET",
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(KEY_CHECK_TIMEOUT_MS),
    });
  } catch {
    /*
      오류 메시지를 그대로 쓰지 않는다. 제어 문자가 섞인 키는 `fetch`가
      `Headers.append: "Key <키>" is an invalid header value` 처럼 키를 메시지에 그대로 담아
      던질 수 있다 — 고정 문구만 돌려준다(화면·기록으로 키가 새지 않게).
    */
    return { ok: false, reason: "unavailable", detail: "network" };
  }
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  if (response.ok || response.status === 404) return { ok: true };
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "invalid", status: response.status, detail };
  return { ok: false, reason: "unavailable", status: response.status, detail };
}

export function falQueueOps(key: string, factory: ClientFactory = createFalClient): FalQueueOps {
  const client = factory({ credentials: key, retry: { maxRetries: 0 } });
  return {
    async status(endpoint, requestId) {
      const status = await client.queue.status(endpoint, { requestId, logs: false });
      if (status.status === "IN_QUEUE") return "queued";
      if (status.status === "IN_PROGRESS") return "in_progress";
      return "completed";
    },
    async result(endpoint, requestId) {
      const result = await client.queue.result(endpoint as never, { requestId });
      return result.data as unknown;
    },
    async cancel(endpoint, requestId) {
      await client.queue.cancel(endpoint, { requestId });
    },
  };
}
