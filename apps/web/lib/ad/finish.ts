import "server-only";

import { markAsAi } from "../watermark";
import { stampAiMetadata } from "../ai-metadata";

export type AdFinish = (bytes: Buffer) => Promise<Buffer>;

/**
 * 광고 파생본에 마지막으로 무엇을 할까.
 *
 * ── 왜 함수로 꺼냈나 ───────────────────────────────────────
 *
 * 이 한 줄이 **규정 준수를 가르는 결정**인데, 라우트 안에 있으면 시험할 길이
 * 없다(그 핸들러는 인증·장부·라이브러리·`exportBatch` 를 다 거친다). 저장소가
 * 같은 이유로 같은 일을 이미 했다 — `image-encoding.ts` 가 `encode` 를 밖에서
 * 넣을 수 있게 둔 것은 「작을 때만 바꾼다」 규칙을 시험하기 위해서다.
 *
 * ── 끈 경우에도 표시는 넣는다 ──────────────────────────────
 *
 * 예전에는 배지가 꺼져 있으면 아무것도 안 했다. 그러면 광고 소재가 **표시 하나
 * 없이 ZIP 으로 나간다** — 사용자가 그것을 네이버·카카오에 올리므로, 인공지능
 * 기본법 제31조가 요구하는 「파일 자체의 표시」가 없는 상태다.
 *
 * **배지를 끄는 것은 보이는 표기를 끄는 결정이지, 표시를 안 하겠다는 결정이
 * 아니다.** 그래서 껐으면 배지 없이 파일 안 표시만 찍는다.
 *
 * 설정값을 받아 오는 것은 부르는 쪽이 이미 한 번 읽었기 때문이다. 여기서 다시
 * 읽으면 규격 수만큼 조회가 돈다 — 라우트가 경계한 그것이다.
 */
export function finishForAd(badgeEnabled: boolean): AdFinish {
  return badgeEnabled ? markAsAi : stampAiMetadata;
}
