/**
 * **생성 결과를 어디로 지우나**(2026-10-08 — 회원이 지워도 남기고, 완전 삭제는 관리자만).
 *
 * 회원의 지우기는 각 도구 주소로 가고 서버가 「지운 때」만 적는다 — 회원 화면에서 사라지고 데이터·그림은 남아
 * 관리자가 확인한다(6개월 뒤 파기). 관리자가 지우면 서버가 완전히 지운다. 다만 상세페이지 문서는 회원 주소가 지운
 * 때만 적으므로, 관리자는 자기 문서든 남의 문서든 언제나 관리자 주소로 간다 — 회원 주소로 가면 관리자 자기 문서가
 * 「회원이 삭제함」으로 남고 다시 못 지운다.
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
  /** 캐릭터 표의 캐릭터. 캐릭터 지우기 주소가 각도 그림·참고 이미지까지 함께 지운다(2026-10-09). */
  characterId?: string;
}

export function deleteRequest(work: DeletableWork, isAdmin: boolean): { url: string; init: RequestInit } {
  const init: RequestInit = { method: "DELETE" };
  if (work.characterId) {
    // 관리자가 남의 캐릭터를 지울 때도 같은 주소다 — 주인은 서버가 찾는다(화면이 보낸 값을 믿지 않는다).
    return {
      url: "/api/characters",
      init: { ...init, headers: { "content-type": "application/json" }, body: JSON.stringify({ id: work.characterId }) },
    };
  }
  if (work.documentId) {
    return isAdmin
      ? { url: `/api/admin/pdp-documents/${work.documentId}?owner=${encodeURIComponent(work.documentOwner ?? "")}`, init }
      : { url: `/api/pdp/documents/${work.documentId}`, init };
  }
  if (work.tool === "create" || work.tool === "redesign" || work.tool === "ad") {
    return {
      url: "/api/library",
      init: { ...init, headers: { "content-type": "application/json" }, body: JSON.stringify({ id: work.id }) },
    };
  }
  return { url: work.tool === "sns" ? `/api/sns/projects/${work.id}` : `/api/poster/projects/${work.id}`, init };
}

/** 관리자 목록의 「회원이 삭제함 · 날짜」. */
export function deletedLabel(deletedAt: string): string {
  const day = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(deletedAt));
  return `회원이 삭제함 · ${day}`;
}
