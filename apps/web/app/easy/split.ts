/**
 * 대시보드 안 **구분선 둘**의 자리 (2026-09-18 · 2026-09-21 사용자 요청).
 *
 * 칸이 셋이라 구분선이 둘이다 — **대화 목록 | 대화 | 결과**.
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

/** 결과 칸의 최소·최대 너비(px). `RESULT_MAX` 는 `w-[45rem]` 과 같다. */
export const RESULT_MIN = 240;
export const RESULT_MAX = 720;

/**
 * 대화 쪽에 남겨 둘 최소 너비(px).
 *
 * **모델 줄이 두 줄로 접히지 않는 너비다.** 360 이었는데, 목록을 288 로 넓히자
 * (2026-09-21) 대화가 그 바닥까지 눌리면서 입력창 위 모델 줄이 두 줄로 접혔다.
 * 재 보니 「글 · 모델 이름 · 이미지 · 모델 이름」이 한 줄에 서려면 430 쯤이
 * 든다 — 이름이 가장 긴 `gpt-image-2.5-sunburst` 까지 쳤다.
 *
 * 바닥이 하는 일이 그것이다. **못 쓸 만큼 좁아지는 자리에서 멈추는 것.**
 */
export const CHAT_MIN = 440;

/**
 * 구분선 하나가 먹는 너비(px). `w-2` 와 같다.
 *
 * **셈에 넣어야 바닥이 진짜 바닥이 된다.** 안 빼면 선 하나당 8px 씩 대화가
 * `CHAT_MIN` 아래로 눌린다 — 실제로 352 까지 내려갔다(2026-09-21 실측).
 */
export const HANDLE = 8;

/**
 * 처음 너비 — **끌 수 있는 데까지 미리 끌어 둔 값**이다 (2026-09-21 사용자).
 *
 * 전에는 352 였다. 사용자가 「결과 나오는 섹션의 가로 사이즈가 작으니까
 * 늘려주세요… 처음부터 사용자가 늘릴 수 있는 만큼 최대한으로 늘려서 그걸
 * 기본값으로 하세요」라고 했다.
 *
 * **그래서 상한을 그대로 기본값으로 쓴다.** 따로 숫자를 적지 않는다 — 적으면
 * 상한을 고칠 때 둘이 갈리고, 「최대한」이 최대한이 아니게 된다.
 *
 * 화면이 좁아 상한만큼 못 주면 `clampResultWidth` 가 알아서 줄인다. 그때도
 * **그 화면에서 끌 수 있는 최대**가 된다.
 */
export const RESULT_DEFAULT = RESULT_MAX;

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
  const ceiling = Math.min(RESULT_MAX, available - CHAT_MIN - HANDLE);

  // 대화 바닥조차 못 지키는 너비면 결과 칸을 접는다. 화면이 그것을 안 그린다.
  if (ceiling < RESULT_MIN) return 0;

  return Math.round(Math.min(ceiling, Math.max(RESULT_MIN, wanted)));
}

/** 저장해 둔 값을 읽을 때 쓴다. 숫자가 아니면 기본으로 떨어진다. */
export function readResultWidth(stored: string | null): number {
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : RESULT_DEFAULT;
}

/* ─────────────────────────────────────────────────────────────
   대화 목록 칸 (2026-09-21 사용자 — 「채팅목록 사이즈 더 넓혀주세요.
   그리고 여기도 마우스로 클릭시 선 이동 될 수 있게 하세요」)
   ───────────────────────────────────────────────────────────── */

/** 대화 목록의 최소·최대 너비(px). */
export const LIST_MIN = 200;
export const LIST_MAX = 420;

/**
 * 처음 너비. `w-[18rem]` 과 같다 — 고치면 둘이 갈리므로 여기서만 정한다.
 *
 * 224 였다. 「따뜻한 느낌의 카페 오픈 포스터」 같은 제목이 반도 못 가고 잘렸다.
 */
export const LIST_DEFAULT = 288;

/**
 * 끌어 놓은 자리를 **쓸 수 있는 목록 너비로** 바꾼다.
 *
 * ── 결과 칸과 다른 점 둘 ─────────────────────────────────────
 *
 * **접지 않는다.** 결과 칸은 자리가 없으면 0 이 되어 사라지는데, 목록은 대화를
 * 갈아타는 길이라 사라지면 갈 곳이 없어진다. 좁은 화면에서는 애초에 떠 있는
 * 판이라 이 셈에 끼지도 않는다.
 *
 * **결과 칸 몫을 빼 두지 않는다.** 목록을 끄는 사람은 지금 목록을 넓히려는
 * 것이다. 줄어들 쪽은 결과 칸이고, 그쪽은 제 셈(`clampResultWidth`)이 다시
 * 가둔다 — 대화 바닥(`CHAT_MIN`)만 여기서 지킨다.
 *
 * @param available 목록·대화·결과가 나눠 가질 전체 너비
 * @param wanted    끌어서 만들려는 목록 너비
 */
export function clampListWidth(available: number, wanted: number): number {
  const ceiling = Math.min(LIST_MAX, available - CHAT_MIN - HANDLE);

  // 대화 바닥조차 못 지키는 너비면 더 줄일 것이 없다. 최소에서 멈춘다.
  if (ceiling < LIST_MIN) return LIST_MIN;

  return Math.round(Math.min(ceiling, Math.max(LIST_MIN, wanted)));
}

/** 저장해 둔 값을 읽을 때 쓴다. 숫자가 아니면 기본으로 떨어진다. */
export function readListWidth(stored: string | null): number {
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LIST_DEFAULT;
}
