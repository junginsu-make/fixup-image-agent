/**
 * 확대할 때 열 주소.
 *
 * 목록이 작은 사본을 거는 자리가 생겼다. 그런데 확대는 **원본을 보는 자리**다 —
 * 사본을 열면 인쇄 시안을 깎인 그림으로 검사하게 되고, 뷰어의 "원본 크기"
 * 표시까지 거짓말이 된다.
 *
 * 그래서 사본을 거는 곳만 `data-viewer-src` 로 원본을 함께 알려 준다. 안 달아
 * 둔 자리는 예전 그대로 보이는 그림을 연다.
 */
export function viewerSourceOf(
  image: { viewerSrc?: string; currentSrc?: string; src?: string },
): string {
  return image.viewerSrc || image.currentSrc || image.src || "";
}
