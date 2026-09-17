/**
 * 「내 카드뉴스 만들기」를 **한 화면 안에** 넣는 규칙.
 *
 * 사용자는 이 화면을 스크롤 없이 한눈에 보고 작업하기를 바란다(2026-09-17).
 * 그런데 보는 사람마다 쓸 수 있는 자리가 다르다 — 모니터 해상도, 윈도우 배율
 * (125%·150%), 브라우저 확대 비율이 제각각이다. 그래서 **어림값을 쓰지 않고
 * 실제로 남은 자리를 재서** 맞춘다.
 *
 * 화면(DOM)을 여기서 안 만진다. 재는 일은 `use-fit-screen.ts` 가 하고, 여기는
 * 잰 값으로 크기를 정하기만 한다 — 그래야 값으로 시험할 수 있다.
 */

/**
 * 카드 칸이 커질 수 있는 한계. 자리가 넉넉해도 이보다 크게는 안 그린다.
 *
 * 좌표는 비율이라 이 값이 바뀌어도 틀은 그대로다.
 */
export const CANVAS_MAX_WIDTH = 560;
export const CANVAS_MAX_HEIGHT = 620;

/**
 * 아무리 좁아도 남기는 **짧은 변** 길이. 이보다 작으면 칸 테두리를 손으로 잡기
 * 어렵다. 그때는 열 안에서 스크롤하는 편이 낫다.
 *
 * 처음엔 「높이 200」이었다. 그러면 가로형(16:9)은 폭이 356 이 되어 좁은 화면에서
 * 옆으로 넘쳤다(1093×590 실측). 짧은 변으로 잡으면 세로형·가로형 모두 같은 정도로
 * 작아진다.
 */
const CANVAS_MIN_SIDE = 160;

/**
 * 작업 영역이 쓸 높이 — **화면 높이에서 위에 실제로 놓인 것과 아래 여백을 뺀다.**
 *
 * 전에는 「화면 높이 − 144px」로 어림잡았다. 위에 놓인 것은 약 170px 이었고
 * 프로젝트 필터 띠가 뜨면 더 두꺼워져, 그만큼 아래로 넘쳐 버튼이 잘렸다.
 */
export function fillHeight(input: { viewport: number; top: number; bottomGap: number; min?: number }): number {
  return Math.max(input.min ?? 0, Math.floor(input.viewport - input.top - input.bottomGap));
}

/**
 * 카드 비율을 지키면서 **남은 자리와 한계 둘 다** 안에 들어가는 가장 큰 크기.
 *
 * 자리를 아직 못 쟀으면(첫 그림) 한계만 본다 — 첫 그림이 손톱만 했다가 커지면
 * 화면이 튄다.
 */
export function canvasSize(
  card: { width: number; height: number },
  space: { width: number; height: number } = { width: Infinity, height: Infinity },
): { width: number; height: number } {
  /*
    **가로·세로 어느 쪽이 좁아도 바닥 아래로는 안 준다.** 세로에만 바닥이 있었더니,
    가로 한계가 좁은 화면(폭 1024)에서 캔버스가 67×84 로 쪼그라들고, 가로 한계가
    음수가 되면 크기도 음수가 나왔다(2026-09-17 독립 리뷰). 그 구간에서는 조금
    넘치더라도 손으로 칸을 잡을 수 있는 크기를 지킨다.
  */
  const maxWidth = Math.min(CANVAS_MAX_WIDTH, space.width);
  const maxHeight = Math.min(CANVAS_MAX_HEIGHT, space.height);
  const fit = Math.min(maxWidth / card.width, maxHeight / card.height);
  const floor = CANVAS_MIN_SIDE / Math.min(card.width, card.height);
  const scale = Math.max(floor, fit);
  return { width: Math.round(card.width * scale), height: Math.round(card.height * scale) };
}

/**
 * 열 배치. **넓은 화면은 네 열, 그보다 좁으면 세 열**(레이어 목록과 칸 설정을 한 열에
 * 위아래로 쌓는다).
 *
 * 네 열의 최소 폭 합(17+11+14+15rem = 912px)은 1280 보다 좁은 화면의 본문에 안
 * 들어간다. 1366 노트북을 125% 로 쓰면 폭이 약 1093 인데, 거기서 네 열을 고집하면
 * 캔버스가 손톱만 해지거나 가로로 넘쳤다(2026-09-17 독립 리뷰).
 *
 * `otherRem` 은 캔버스 열을 뺀 나머지 열의 최소 폭 합, `gaps` 는 열 사이 틈 수다.
 * **화면의 열 정의(`layout-client.tsx`)를 바꾸면 여기도 바꾼다.**
 */
export const COLUMN_LAYOUTS = {
  four: { otherRem: 11 + 14 + 15, gaps: 3 },
  // 17+13+14rem + 틈 둘 = 728px — 폭 1024 창의 본문(743px)에 들어간다(실측).
  three: { otherRem: 13 + 14, gaps: 2 },
} as const;

/** 열 사이 틈(`gap-3`). */
export const COLUMN_GAP_PX = 12;

/**
 * 캔버스가 쓸 수 있는 가로 — **캔버스에 따라 안 변하는 바깥 폭**에서 나머지 열의
 * 최소 폭과 틈을 뺀다.
 */
export function canvasWidthLimit(outerWidth: number, rem: number, layout: keyof typeof COLUMN_LAYOUTS): number {
  const { otherRem, gaps } = COLUMN_LAYOUTS[layout];
  return Math.floor(outerWidth - gaps * COLUMN_GAP_PX - otherRem * rem);
}
