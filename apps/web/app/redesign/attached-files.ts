/**
 * 리디자인에 첨부한 원본 파일 목록을 다루는 규칙.
 *
 * 전에는 파일을 고를 때마다 목록을 **통째로 갈아 끼웠다.** 긴 상세페이지를
 * 조각으로 나눠 올리는 것이 이 도구의 정상 사용인데, 나눠 고르면 마지막 것만
 * 남았다(2026-09-23 실제 브라우저로 확인). 한 장씩 뺄 길도 없었다.
 */

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * 그림이나 PDF 인가. **보낼 때와 같은 기준이다**(`normalizeFilesForUpload`).
 * 종류가 빈 그림을 목록에 넣으면, 보일 뿐 생성에는 안 쓰인다(독립 리뷰).
 */
export function isAcceptedFile(file: File): boolean {
  return file.type.startsWith("image/") || isPdf(file);
}

/**
 * 같은 파일인지 가리는 열쇠. **이름만 보지 않는다** — 라이브러리에서 고른
 * 그림은 이름이 겹칠 수 있다.
 */
export function attachedFileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** 새로 고른 것을 뒤에 붙인다. 이미 있는 것은 또 넣지 않는다. */
export function mergeAttachedFiles(current: readonly File[], incoming: readonly File[]): File[] {
  const seen = new Set(current.map(attachedFileKey));
  const added = incoming.filter((file) => {
    if (!isAcceptedFile(file)) return false;
    const key = attachedFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...current, ...added];
}

export function removeAttachedFile(current: readonly File[], key: string): File[] {
  return current.filter((file) => attachedFileKey(file) !== key);
}
