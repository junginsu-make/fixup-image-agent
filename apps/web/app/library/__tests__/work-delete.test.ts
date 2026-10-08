import { describe, expect, it } from "vitest";
import { deleteRequest } from "../work-delete";

/**
 * **지우는 주소**(2026-10-09 — 관리자는 남의 상세페이지·캐릭터도 지운다).
 *
 * 상세페이지 문서는 회원 주소가 자기 문서만 찾으므로 관리자는 관리자 주소로 간다. 캐릭터는 캐릭터 지우기 주소가
 * 캐릭터 표·각도 그림·참고 이미지를 함께 지운다(주인은 서버가 찾는다).
 */
const base = { id: "w1", mine: true } as const;

describe("어디로 지우나", () => {
  it("카드뉴스·포스터는 각 도구 주소", () => {
    expect(deleteRequest({ ...base, tool: "sns" }, false).url).toBe("/api/sns/projects/w1");
    expect(deleteRequest({ ...base, tool: "poster" }, false).url).toBe("/api/poster/projects/w1");
  });

  it("계정 보관 작업(상세페이지 옛 저장분·리디자인·광고소재)은 라이브러리 주소에 id 를 실어", () => {
    for (const tool of ["create", "redesign", "ad"] as const) {
      const request = deleteRequest({ ...base, tool }, false);
      expect(request.url).toBe("/api/library");
      expect(request.init.body).toBe(JSON.stringify({ id: "w1" }));
    }
  });

  it("회원의 상세페이지 문서는 문서 주소", () => {
    expect(deleteRequest({ ...base, tool: "create", documentId: "d1", documentOwner: "u1" }, false).url).toBe("/api/pdp/documents/d1");
  });

  it("관리자는 상세페이지 문서를 관리자 주소로 — 주인을 실어", () => {
    expect(deleteRequest({ id: "d1", mine: false, tool: "create", documentId: "d1", documentOwner: "u9" }, true).url)
      .toBe("/api/admin/pdp-documents/d1?owner=u9");
    expect(deleteRequest({ id: "d1", mine: true, tool: "create", documentId: "d1", documentOwner: "a1" }, true).url)
      .toBe("/api/admin/pdp-documents/d1?owner=a1");
  });

  it("캐릭터는 캐릭터 지우기 주소에 id 를 실어 — 관리자여도 같다", () => {
    for (const admin of [false, true]) {
      const request = deleteRequest({ id: "c1", mine: !admin, tool: "create", characterId: "c1" }, admin);
      expect(request.url).toBe("/api/characters");
      expect(request.init.body).toBe(JSON.stringify({ id: "c1" }));
    }
  });

  it("언제나 DELETE", () => {
    expect(deleteRequest({ ...base, tool: "sns" }, false).init.method).toBe("DELETE");
  });
});
