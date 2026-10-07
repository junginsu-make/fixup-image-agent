/**
 * **서버 기록에 남길 오류 글**(2026-10-07 후속 최종 수정 1, 보안 리뷰). 오류 덩어리를 그대로 찍지 않는다 —
 * 업체 · 저장소 오류 글에 서명한 주소가 섞여 올 수 있다. 주소는 `<url>` 로 가린다(`see-turn.ts` 와 같은 규칙).
 */
export function errorLogText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/g, "<url>");
}
