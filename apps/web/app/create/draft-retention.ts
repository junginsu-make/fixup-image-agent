/**
 * 저장된 작업(초안)을 언제까지 두는가.
 *
 * 초안은 30초마다 자동 저장되고 **작업을 새로 시작할 때마다 하나씩** 늘어난다.
 * 그런데 지우는 장치가 없어서 시작 화면의 '이어서 작업하기' 목록이 끝없이 쌓였다.
 * 사용자가 "저건 왜 계속 생기냐"고 물은 것이 이 문제다.
 *
 * 브라우저 IndexedDB 에 쌓이므로 서버 용량과는 무관하지만, 목록이 길어지면
 * 정작 이어서 할 작업을 찾기 어렵다.
 *
 * 개수(최근 N개)가 아니라 **날짜**로 자른다. 개수로 자르면 "어제 만든 게 왜
 * 없어졌지?"가 되지만, 날짜는 사용자가 스스로 셈할 수 있다.
 */

/** 이 기간이 지난 초안은 자동으로 지운다. */
export const DRAFT_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 화면에 적는 안내. 문구를 한곳에서만 고치도록 여기에 둔다. */
export const DRAFT_RETENTION_NOTICE = `저장한 지 ${DRAFT_RETENTION_DAYS}일이 지난 작업은 자동으로 삭제됩니다.`;

/**
 * 만료된 초안의 id 를 고른다.
 *
 * **마지막으로 저장한 시각**(`updatedAt`)을 기준으로 센다. 만든 날로 세면 오래
 * 붙잡고 다듬는 작업이 작업 도중에 사라진다.
 *
 * 날짜를 읽을 수 없는 기록은 **남긴다.** 저장 형식이 바뀌었거나 깨진 경우인데,
 * 판단이 안 서면 지우지 않는 쪽이 맞다 — 되돌릴 수 없는 일이다.
 *
 * @param now 기준 시각. 테스트에서 고정하려고 받는다.
 */
export function selectExpiredDraftIds(
  drafts: ReadonlyArray<{ id: string; updatedAt: string }>,
  now: Date,
  retentionDays: number = DRAFT_RETENTION_DAYS,
): string[] {
  const cutoff = now.getTime() - retentionDays * DAY_MS;

  return drafts
    .filter((draft) => {
      const savedAt = Date.parse(draft.updatedAt);
      if (Number.isNaN(savedAt)) return false;
      return savedAt < cutoff;
    })
    .map((draft) => draft.id);
}
