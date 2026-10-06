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

const 묻는간격 = 10_000;
const 기다린다 = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 받으면 그 그림, 화면을 떠났으면 `undefined`. 0장이면 `NO_IMAGE_MADE` 로 던진다. */
export async function collectEasyImage(
  projectId: string,
  submission: EasySubmission,
  isAlive: () => boolean,
  wait: (ms: number) => Promise<void> = 기다린다,
): Promise<{ id: string; url: string } | undefined> {
  const body = {
    requestRowId: submission.requestRowId,
    falRequestId: submission.falRequestId,
    endpoint: submission.endpoint,
    unitCostUsd: submission.estimatedUsd ?? 0,
  };
  for (;;) {
    if (!isAlive()) return undefined;
    await wait(묻는간격);
    if (!isAlive()) return undefined;
    /*
      결과를 묻는 자리다. 예약이 아니라 **정산**이라 열쇠를 요구하지 않지만,
      포스터 화면과 같은 길(`billableFetch`)로 보낸다.
    */
    const poll = await (await billableFetch(`/api/poster/projects/${projectId}/status`, {
      body: JSON.stringify(body),
    })).json();
    observeAccountResponse(poll, false);
    if (!poll.ok) throw new Error(poll.message ?? "상태를 확인하지 못했습니다.");
    if (poll.done) {
      // 이번 요청의 그림 — 고치기는 같은 작업에 그림을 더해 첫 장이 원본이다(`row-image.ts`).
      const first = pickCollectedImage<{ id: string; url: string; generationRequestId?: string }>(poll.images, submission.requestRowId);
      if (!first) throw new Error(NO_IMAGE_MADE);
      return { id: first.id, url: first.url };
    }
  }
}
