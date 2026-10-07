"use client";

import * as React from "react";
import { NO_IMAGE_MADE, collectEasyImage } from "./collect";
import { rowJobOf, type EasyRowJob } from "./row-image";
import type { EasyMessage } from "./turn";

/**
 * **다시 열면 이어 받는다**(2026-10-06 설계 B3).
 *
 * 그림을 받아 저장하는 일은 화면이 `status` 에 물을 때만 일어난다. 만드는 중에 떠났다
 * 돌아오면 아무도 안 물어서 「이미지를 만들고 있습니다」가 영원히 돌았다. 그림 줄에
 * 적어 둔 받을 정보(`row-image.ts` 의 `;job=`)로 만든 직후와 같은 함수를 부른다.
 *
 * 받을 정보가 없는 옛 줄은 지금처럼 둔다 — 무엇을 물을지 모른다.
 *
 * **아직 안 끝난 요청의 줄만** 묻는다(최종 리뷰 2026-10-06). `status` 는 끝난 요청을 다시
 * 물으면 결과를 또 저장하고 또 정산한다(`lib/poster/flow.ts` 의 `collectPoster`). 끝났는지는
 * 서버가 요청 줄로 보고 `pendingIds` 로 넘긴다(`_components/load.ts` → `lib/easy/pending-requests.ts`).
 */
export interface EasyResumeTarget {
  rowId: string;
  projectId: string;
  job: EasyRowJob;
}

export function resumeTargets(
  messages: readonly EasyMessage[],
  urls: Readonly<Record<string, string>>,
  cardnewsIds: ReadonlySet<string>,
  /** 서버가 본 「아직 결과를 안 받은 그림 줄」. 여기 없는 줄은 끝난 것이다. */
  pendingIds: ReadonlySet<string>,
): EasyResumeTarget[] {
  return messages.flatMap((message) => {
    if (message.role !== "image" || !message.workId || urls[message.id] || cardnewsIds.has(message.id)) return [];
    if (!pendingIds.has(message.id)) return [];
    const job = rowJobOf(message.body);
    return job ? [{ rowId: message.id, projectId: message.workId, job }] : [];
  });
}

/** 줄 id → 못 받은 까닭. 받은 그림은 `onImage` 로 넘긴다. **처음 그릴 때 한 번만** 묻는다. */
export function useEasyResume(input: {
  messages: readonly EasyMessage[];
  urls: Readonly<Record<string, string>>;
  cardnewsIds: ReadonlySet<string>;
  pendingIds: ReadonlySet<string>;
  /** 서버가 본 「끝났는데 그림이 없는 줄」(설계 B5, 리뷰 1차). 묻지 않고 처음부터 실패로 보인다. */
  failedIds?: ReadonlySet<string>;
  isAlive: () => boolean;
  onImage: (rowId: string, image: { id: string; url: string }) => void;
}): Readonly<Record<string, string>> {
  const [failed, setFailed] = React.useState<Record<string, string>>(
    () => Object.fromEntries([...(input.failedIds ?? [])].map((id) => [id, NO_IMAGE_MADE])),
  );
  const first = React.useRef(input);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { messages, urls, cardnewsIds, pendingIds, isAlive, onImage } = first.current;
    for (const target of resumeTargets(messages, urls, cardnewsIds, pendingIds)) {
      collectEasyImage(target.projectId, target.job, isAlive)
        .then((image) => { if (image && isAlive()) onImage(target.rowId, image); })
        .catch((cause: unknown) => {
          if (!isAlive()) return;
          const message = cause instanceof Error ? cause.message : NO_IMAGE_MADE;
          setFailed((current) => ({ ...current, [target.rowId]: message }));
        });
    }
  }, []);

  return failed;
}
