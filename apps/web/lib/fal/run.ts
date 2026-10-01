import { falQueueOps, type FalQueueOps, type FalSubmitCost } from "./http";
import type { FalRouter } from "./route";

/**
 * **대기열에 맡기고, 끝날 때까지 이 요청 안에서 묻는다**(설계 2026-09-29 §3.3).
 *
 * 동기 호출(`fal.run`)은 fal 계정의 동시 한도를 넘으면 **곧바로 429** 로 실패했다. 대기열은 한도를
 * 넘어도 fal 쪽에서 기다린다. 그래서 상세페이지·캐릭터·리디자인이 같은 그림을 대기열로 받는다 —
 * 화면이 기다리는 시간과 응답 모양은 그대로다.
 *
 * - fal 쪽 대기 상한(`startTimeoutS`): 이만큼 지나도 시작을 못 하면 fal 이 504(`timeoutType=user`)로 끝낸다
 * - 우리 쪽 상한(`deadlineMs`): 지나면 취소를 한 번 보내고 `FalRunTimeoutError`. 동기 호출 때도 Node `fetch`
 *   의 머리 대기 상한(undici `headersTimeout` 300초)이 사실상 같은 끝이었다
 * - 끝나면(성공·실패·포기 모두) `router.finished` — 계정 풀의 동시 수 세기에서 뺀다
 * - `pollMs` 를 안 주면 줄 서 있는 동안(`queued`)은 3초, 만드는 중이면 1초 간격으로 묻는다. 100명이
 *   몰리면 대부분이 fal 줄에 서 있는데, 그 사이 1초마다 물으면 서버가 내는 상태 확인이 진행 중인
 *   장수만큼 초당 쌓인다(최종 리뷰). 줄에서 나온 뒤에도 그림을 만드는 시간이 있어, 늦게 알아채는
 *   몫은 대개 그 안에 묻힌다. **`pollMs` 를 직접 주면 그 값이 모든 단계에 그대로 간다**(보충
 *   2026-10-01) — 배경 제거처럼 60초 시한에 3초 간격을 강제하면 너무 성기다
 */

export const FAL_RUN_POLL_MS = 1_000;
export const FAL_RUN_QUEUED_POLL_MS = 3_000;
export const FAL_RUN_DEADLINE_MS = 300_000;
export const FAL_RUN_START_TIMEOUT_S = 120;

/** 우리 쪽 상한을 넘겼다. 504 를 실어 `classifyFalFailure` 가 「제공자 쪽 문제」로 읽게 한다. */
export class FalRunTimeoutError extends Error {
  readonly status = 504;
  constructor(readonly requestId: string) {
    super("이미지 생성이 너무 오래 걸렸습니다. 다시 시도해 주세요.");
    this.name = "FalRunTimeoutError";
  }
}

export interface RunFalQueuedOptions {
  endpoint: string;
  input: Record<string, unknown>;
  /** 있으면 제출 자리에서 비용 한 줄. 부르는 쪽이 따로 적으면 비운다(배경 제거의 `onEnqueue`). */
  cost?: FalSubmitCost;
  startTimeoutS?: number;
  deadlineMs?: number;
  pollMs?: number;
  /** 끊으면 그만 묻고 취소를 한 번 보낸다. */
  signal?: AbortSignal;
  /** fal 이 요청을 받은 순간. */
  onSubmitted?: (requestId: string) => void;
}

export interface RunFalDeps {
  opsFor: (key: string) => FalQueueOps;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function abortError(): Error {
  const error = new Error("요청을 멈췄습니다.");
  error.name = "AbortError";
  return error;
}

export async function runFalQueued(
  router: FalRouter,
  options: RunFalQueuedOptions,
  deps: Partial<RunFalDeps> = {},
): Promise<{ requestId: string; data: unknown }> {
  const opsFor = deps.opsFor ?? falQueueOps;
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const explicitPollMs = options.pollMs;
  const deadline = now() + (options.deadlineMs ?? FAL_RUN_DEADLINE_MS);

  if (options.signal?.aborted) throw abortError();
  const { requestId, route } = await router.submit(options.endpoint, options.input, {
    startTimeoutS: options.startTimeoutS ?? FAL_RUN_START_TIMEOUT_S,
    cost: options.cost,
  });
  const ops = opsFor(route.key);
  const cancel = () => ops.cancel(options.endpoint, requestId).catch(() => undefined);

  try {
    options.onSubmitted?.(requestId);
    for (;;) {
      if (options.signal?.aborted) {
        await cancel();
        throw abortError();
      }
      const phase = await ops.status(options.endpoint, requestId);
      if (phase === "completed") {
        return { requestId, data: await ops.result(options.endpoint, requestId) };
      }
      if (now() >= deadline) {
        await cancel();
        throw new FalRunTimeoutError(requestId);
      }
      const wait = explicitPollMs ?? (phase === "queued" ? FAL_RUN_QUEUED_POLL_MS : FAL_RUN_POLL_MS);
      await sleep(Math.max(0, Math.min(wait, deadline - now())));
    }
  } finally {
    router.finished(requestId);
  }
}
