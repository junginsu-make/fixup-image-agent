/**
 * **쓴 사진은 입력창에서 내린다**(2026-10-07 2차 설계 D3 · §3-3, ChatGPT 처럼).
 *
 * 이미지를 만들거나 고치거나(`projectId` + `submission`) 카드뉴스 원고를 쓴(`cardnews`) 턴에만
 * 비운다. 물음 · 대화 · 실패 · 손보기에는 그대로 둔다 아직 안 썼거나 다시 보내야 한다. 원고 고치기(`revised`)도
 * 그대로다 — 앞 원고의 첨부를 쓰고 붙인 사진은 안 쓴다(최종 수정 8).
 * 다시 쓰려면 다시 붙인다(라이브러리에 있다). 화면 안에 두면 값으로 못 잰다.
 */
export function usedAttachments(body: Record<string, unknown>): boolean {
  if (body.ok !== true) return false;
  return (typeof body.projectId === "string" && Boolean(body.submission)) || (Boolean(body.cardnews) && body.revised !== true);
}
