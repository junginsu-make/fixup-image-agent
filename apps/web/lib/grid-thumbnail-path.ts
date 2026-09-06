/**
 * 격자 사본의 자리와, 지울 때 모을 경로.
 *
 * **`server-only` 를 붙이지 않는다.** 순수한 문자열 규칙이라 서버 전용 모듈에
 * 두면 그것을 쓰는 쪽까지 전부 서버 전용이 되고, 그 자리를 지나가는 시험이
 * 통째로 못 돌게 된다.
 */

/**
 * 사본이 놓일 자리.
 *
 * 원본 경로에 `.thumb.webp` 를 덧붙인다 — **원본 이름 규칙은 건드리지 않는다.**
 * 참고 이미지의 `storage_path` 에는 표 제약이 걸려 있어 더욱 그렇다.
 */
export function gridThumbPath(originalPath: string): string {
  const dot = originalPath.lastIndexOf(".");
  const slash = originalPath.lastIndexOf("/");
  const stem = dot > slash ? originalPath.slice(0, dot) : originalPath;
  return `${stem}.thumb.webp`;
}

/**
 * 지울 경로를 모은다. 원본과 사본을 함께.
 *
 * 행이 사라지면 사본의 자리를 아는 근거가 없어진다 — 앞선 작업에서 네 번
 * 반복해 잡힌 실수다.
 */
export function gridPathsToRemove(
  rows: Array<{ path?: string | null; thumbPath?: string | null }>,
): string[] {
  return rows.flatMap((row) => [row.path, row.thumbPath].filter(Boolean) as string[]);
}
