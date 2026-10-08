/**
 * **생성 결과를 어디로 지우나**(2026-10-09 — 관리자는 남의 상세페이지·캐릭터도 지운다).
 *
 * 상세페이지 문서는 회원 주소가 자기 문서만 찾으므로, 관리자는 관리자 주소로 간다(주인을 실어). 캐릭터는 캐릭터
 * 지우기 주소가 캐릭터 표·각도 그림·참고 이미지를 함께 지운다 — 관리자여도 같은 주소, 주인은 서버가 찾는다.
 *
 * **계정 보관 작업은 다른 표에 있다.** 도구 주소로 보내면 아무것도 안 지워지고 사라진 것처럼 보인다 —
 * `lib/library.ts` 가 레퍼런스에서 같은 실수를 겪고 남긴 주석이다.
 */
export interface DeletableWork {
  id: string;
  tool: "sns" | "poster" | "create" | "redesign" | "ad";
  mine: boolean;
  documentId?: string;
  documentOwner?: string;
  characterId?: string;
}

export function deleteRequest(work: DeletableWork, isAdmin: boolean): { url: string; init: RequestInit } {
  const init: RequestInit = { method: "DELETE" };
  const json = (body: unknown): RequestInit => ({ ...init, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (work.characterId) return { url: "/api/characters", init: json({ id: work.characterId }) };
  if (work.documentId) {
    return isAdmin
      ? { url: `/api/admin/pdp-documents/${work.documentId}?owner=${encodeURIComponent(work.documentOwner ?? "")}`, init }
      : { url: `/api/pdp/documents/${work.documentId}`, init };
  }
  if (work.tool === "create" || work.tool === "redesign" || work.tool === "ad") return { url: "/api/library", init: json({ id: work.id }) };
  return { url: work.tool === "sns" ? `/api/sns/projects/${work.id}` : `/api/poster/projects/${work.id}`, init };
}
