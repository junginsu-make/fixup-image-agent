/**
 * 대화와 결과 칸 **사이 구분선**의 자리 (2026-09-18 사용자 요청).
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * 끌 때마다 어디까지 허용할지 판단이 든다. `.tsx` 안에 두면 **값으로 못 잰다**
 * — 이 저장소가 계속 지켜 온 방식이다(2026-09-16 에 `.tsx` 안의 판단이 값
 * 시험을 다 통과한 채로 틀려 있었다).
 *
 * ── 왜 가두나 ───────────────────────────────────────────────
 *
 * **끝까지 끌면 못 돌아온다.** 결과 칸을 0 까지 줄이면 구분선도 같이 사라져
 * 다시 넓힐 손잡이가 없다. 대화 쪽도 마찬가지다 — 입력창이 눌려 글을 못 친다.
 *
 * 그래서 양쪽에 바닥을 둔다. 좁은 화면은 아예 안 나눈다(`lg` 미만).
 */

/** 결과 칸의 최소·최대 너비(px). */
export const RESULT_MIN = 240;
export const RESULT_MAX = 720;

/** 대화 쪽에 남겨 둘 최소 너비(px). 입력창과 말풍선이 들어가는 폭이다. */
export const CHAT_MIN = 360;

/** 처음 너비. `w-[22rem]` 과 같다 — 고치면 둘이 갈리므로 여기서만 정한다. */
export const RESULT_DEFAULT = 352;

/**
 * 끌어 놓은 자리를 **쓸 수 있는 너비로** 바꾼다.
 *
 * @param available 대화와 결과가 나눠 가질 전체 너비
 * @param wanted    끌어서 만들려는 결과 칸 너비
 */
export function clampResultWidth(available: number, wanted: number): number {
  /*
   * **대화 쪽 바닥이 먼저다.** 화면이 좁으면 `RESULT_MIN` 을 지킬 수 없는데,
   * 그때 결과 칸을 우선하면 입력창이 눌린다. 글을 못 치면 이 모드가 아무것도
   * 못 하는 화면이 된다.
   */
  const ceiling = Math.min(RESULT_MAX, available - CHAT_MIN);

  // 대화 바닥조차 못 지키는 너비면 결과 칸을 접는다. 화면이 그것을 안 그린다.
  if (ceiling < RESULT_MIN) return 0;

  return Math.round(Math.min(ceiling, Math.max(RESULT_MIN, wanted)));
}

/** 저장해 둔 값을 읽을 때 쓴다. 숫자가 아니면 기본으로 떨어진다. */
export function readResultWidth(stored: string | null): number {
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESULT_DEFAULT;
}
