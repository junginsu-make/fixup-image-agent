import "server-only";

import { getLocalDatabase, isLocalStoreEnabled } from "../local-store";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * **아직 결과를 안 받은 그림 요청**(2026-10-06 설계 B3, 최종 리뷰).
 *
 * 다시 열 때 이어 받을 줄을 고른다. `status` 는 끝난 요청을 다시 물으면 결과를 **또 저장하고
 * 또 정산한다**(`lib/poster/flow.ts` 의 `collectPoster` 는 이미 받았는지 안 본다). 그래서 받을
 * 정보(`;job=`)가 있어도 끝난 요청은 다시 묻지 않는다.
 *
 * **끝났다 = 요청 줄의 `costUsd` 가 채워졌다.** 만들 때는 비어 있고 결과를 받을 때
 * `PosterRequestStore.complete` 가 처음 채운다(0장이어도 숫자다). 작업의 `status`
 * (`generating`)는 쓰지 않는다 — 고치기 라우트는 그것을 안 바꾸고, 한 작업에 요청이 여럿이다.
 *
 * 저장소 인터페이스(`packages/poster-core`)에 요청 줄을 읽는 길이 없고 그 패키지는 0줄이라
 * 여기서 읽는다. 운영은 **회원 세션**으로 자기 요청 줄만 읽힌다(RLS `members read own poster
 * requests`). 못 읽으면 빈 목록 — 이어 받지 않는다. 또 저장 · 또 정산보다 「만들고
 * 있습니다」가 덜 나쁘다.
 */
export function unfinishedOf(rows: ReadonlyArray<{ id: string; costUsd: number | null | undefined }>): Set<string> {
  return new Set(rows.filter((row) => row.costUsd === null || row.costUsd === undefined).map((row) => row.id));
}

type LocalRequest = { id: string; userId: string; costUsd: number | null };

export async function unfinishedPosterRequests(userId: string, requestIds: readonly string[]): Promise<Set<string>> {
  const ids = [...new Set(requestIds)];
  if (!ids.length) return new Set();
  try {
    if (isLocalStoreEnabled()) {
      // 로컬 파일 저장소의 포스터 요청 칸(`lib/poster/local-store.ts` 의 `posterRequests`). 주인 조건을 같이 건다.
      return unfinishedOf(await getLocalDatabase().read((data) =>
        ((data as { posterRequests?: LocalRequest[] }).posterRequests ?? [])
          .filter((row) => row.userId === userId && ids.includes(row.id))));
    }
    const client = await createSupabaseServerClient();
    const { data, error } = await client.from("poster_generation_requests").select("id,cost_usd").in("id", ids);
    if (error) return new Set();
    return unfinishedOf(((data ?? []) as Array<{ id: string; cost_usd: number | null }>)
      .map((row) => ({ id: row.id, costUsd: row.cost_usd })));
  } catch {
    return new Set();
  }
}
