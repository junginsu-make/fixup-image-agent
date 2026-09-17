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
 * 아무리 좁아도 남기는 높이. 이보다 작으면 칸 테두리를 손으로 잡기 어렵다.
 * 그때는 열 안에서 스크롤하는 편이 낫다.
 */
const CANVAS_MIN_HEIGHT = 200;

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
  const maxWidth = Math.min(CANVAS_MAX_WIDTH, space.width);
  const maxHeight = Math.max(CANVAS_MIN_HEIGHT, Math.min(CANVAS_MAX_HEIGHT, space.height));
  const scale = Math.min(maxWidth / card.width, maxHeight / card.height);
  return { width: Math.round(card.width * scale), height: Math.round(card.height * scale) };
}
