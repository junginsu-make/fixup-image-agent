/**
 * 사진 상한 때문에 뺀 제품 사진 장수를 응답 칸으로 만든다.
 *
 * 양수일 때만 칸을 둔다 — 뺀 게 없으면 응답 모양이 이전과 같아야 화면이 낡은 응답과
 * 새 응답을 가리지 않아도 된다.
 */
export function droppedField(count: number | undefined): { productPhotosDropped?: number } {
  return typeof count === "number" && count > 0 ? { productPhotosDropped: count } : {};
}
