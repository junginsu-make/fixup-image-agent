/**
 * 미리보기 파일의 자리와, 지울 때 모을 경로.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 문자열 규칙이라 서버 전용 모듈에
 * 두면 로컬 저장소처럼 그것을 쓰는 쪽까지 전부 서버 전용이 된다.
 *
 * 규칙을 한 곳에만 두는 이유는 라우트가 여기에 **의존하게 됐기** 때문이다 —
 * `?size=thumb` 갈래가 `.thumb.webp` 라는 이름을 본다. 두 곳에서 따로 자라면
 * 미리보기가 두 종류로 갈리고 삭제가 한쪽만 잡는다.
 */

/** 미리보기가 놓일 자리. **원본 이름 규칙은 건드리지 않는다.** */
export function snsPreviewPath(userId: string, projectId: string, cardIndex: number): string {
  return `${userId}/sns/${projectId}/${cardIndex}.thumb.webp`;
}

/**
 * 지울 경로를 모은다. 회원 삭제와 관리자 삭제가 **같은 답**을 내야 한다.
 *
 * 행이 사라지면 미리보기의 자리를 아는 근거가 없어진다 — 라이브러리·갤러리·
 * 포스터에서 세 번 반복해 잡힌 실수다.
 */
export function snsCardPathsToRemove(
  cards: Array<{ assetPath?: string | null; thumbPath?: string | null }>,
): string[] {
  return cards.flatMap((card) =>
    [card.assetPath, card.thumbPath].filter(Boolean) as string[]);
}
