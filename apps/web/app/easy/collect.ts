import { observeAccountResponse } from "../../lib/membership/account-events";
import { billableFetch } from "../../lib/billable-fetch";
import { pickCollectedImage } from "./row-image";

/**
 * **결과를 받는다** — 기존 `status` 라우트에 물어 받는다(포스터 화면과 같은 길).
 *
 * `easy-client.tsx` 안에 있던 것을 옮겼다(2026-10-06 설계 B3). 만든 직후와 **다시 열
 * 때**(`use-resume-images.ts`)가 같은 함수를 쓴다 — 두 벌이면 하나는 곧 어긋난다.
 */
export interface EasySubmission {
  requestRowId: string;
  falRequestId: string;
  endpoint: string;
  estimatedUsd?: number;
}

/** 끝났는데 이번 요청의 그림이 없을 때(설계 B5). 전에는 「만들고 있습니다」가 영원히 돌았다. */
export const NO_IMAGE_MADE = "이미지가 나오지 않았습니다. 같은 말을 다시 보내 주세요.";
/**
 * 15분을 넘겨 그만 물을 때. 그 요청은 아직 끝날 수 있고, 다시 열면 이어 받는다(B3).
 * 「다시 보내 주세요」는 값이 또 드는 재전송을 부르므로 쓰지 않는다. 화면에서만 알린다.
 */
export const STILL_MAKING = "아직 이미지를 만들고 있을 수 있습니다. 잠시 뒤 이 대화를 다시 열면 이어서 받아 옵니다.";

const 묻는간격 = 10_000;
/** 이만큼 기다려도 안 끝나면 그만둔다(보안 리뷰 L1). 멈춘 요청을 끝없이 묻지 않는다. */
const 최대기다림 = 15 * 60_000;
const 기다린다 = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 앞단(Caddy · Next)이 서버를 못 닿았을 때 주는 상태. 우리 말이 없으면 잠깐의 고장이다. */
const 잠깐상태 = new Set([502, 503, 504]);

/**
 * 상태를 한 번 묻는다. **잠깐의 고장이면 `undefined`**(후속 Task 11 3차) — 부른 쪽이 「아직 안 끝남」으로
 * 보고 다시 묻는다. 연결이 끊긴 것(`fetch` 가 던짐), JSON 이 아닌 답(HTML 502 등), 우리 말 없는 502 · 503 · 504.
 * 그 요청은 아직 돌고 있다. 전에는 영어 글로 실패해 화면의 다시 보내기가 값이 또 드는 재전송이 됐다.
 *
 * 일부러 낸 실패(우리 말이 있는 `ok: false`, 4xx)는 답 그대로 돌려 지금처럼 곧바로 알린다. 4xx 인데
 * JSON 이 아니면 말 없는 실패(`{}`)로 본다. 영어 글은 어느 갈래로도 화면에 안 간다.
 */
async function 묻는다(projectId: string, body: string): Promise<Record<string, any> | undefined> {
  let response: Response;
  try {
    response = await billableFetch(`/api/poster/projects/${projectId}/status`, { body });
  } catch {
    return undefined;
  }
  const 거절됨 = response.status >= 400 && response.status < 500;
  const poll: unknown = await response.json().catch(() => undefined);
  if (!poll || typeof poll !== "object") return 거절됨 ? {} : undefined;
  const 우리말 = (poll as { ok?: unknown }).ok === false && typeof (poll as { message?: unknown }).message === "string";
  return 잠깐상태.has(response.status) && !우리말 ? undefined : poll as Record<string, any>;
}

/**
 * 받으면 그 그림, 화면을 떠났으면 `undefined`. 0장이면 `NO_IMAGE_MADE`, 시작한 지
 * 15분이 지나도 안 끝나면 `STILL_MAKING` 으로 던진다.
 */
export async function collectEasyImage(
  projectId: string,
  submission: EasySubmission,
  isAlive: () => boolean,
  wait: (ms: number) => Promise<void> = 기다린다,
  now: () => number = Date.now,
): Promise<{ id: string; url: string } | undefined> {
  const 시작 = now();
  const body = JSON.stringify({
    requestRowId: submission.requestRowId,
    falRequestId: submission.falRequestId,
    endpoint: submission.endpoint,
    unitCostUsd: submission.estimatedUsd ?? 0,
  });
  for (;;) {
    if (!isAlive()) return undefined;
    await wait(묻는간격);
    if (!isAlive()) return undefined;
    /*
      결과를 묻는 자리다. 예약이 아니라 **정산**이라 열쇠를 요구하지 않지만,
      포스터 화면과 같은 길(`billableFetch`)로 보낸다.
    */
    const poll = await 묻는다(projectId, body);
    // 잠깐의 고장(`undefined`)은 아직 안 끝난 것과 같다 — 아래 상한까지 다시 묻는다.
    if (poll) {
      observeAccountResponse(poll, false);
      if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
      if (poll.done) {
        // 이번 요청의 그림 — 고치기는 같은 작업에 그림을 더해 첫 장이 원본이다(`row-image.ts`).
        const first = pickCollectedImage<{ id: string; url: string; generationRequestId?: string }>(poll.images, submission.requestRowId);
        if (!first) throw new Error(NO_IMAGE_MADE);
        return { id: first.id, url: first.url };
      }
    }
    // 다시 보낼 실패가 아니다(`retryable: false`) — 화면이 「값이 또 듭니다」 재전송 안내를 안 붙인다.
    if (now() - 시작 >= 최대기다림) throw Object.assign(new Error(STILL_MAKING), { retryable: false });
  }
}
