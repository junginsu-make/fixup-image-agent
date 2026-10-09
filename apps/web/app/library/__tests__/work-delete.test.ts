import { describe, expect, it } from "vitest";
import { deleteRequest, deletedLabel } from "../work-delete";

/**
 * **지우는 주소**(2026-10-08 — 회원이 지워도 남기고, 완전 삭제는 관리자만).
 *
 * 회원의 지우기는 각 도구 주소로 가고 서버가 「지운 때」만 적는다. 관리자가 회원이 지운(또는 남의) 상세페이지
 * 문서를 지울 때는 관리자 주소로 가 완전히 지운다 — 회원 주소는 남의 문서를 못 찾는다.
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

  it("내 상세페이지 문서는 문서 주소", () => {
    expect(deleteRequest({ ...base, tool: "create", documentId: "d1", documentOwner: "u1" }, false).url).toBe("/api/pdp/documents/d1");
  });

  it("관리자가 남의 상세페이지 문서를 지우면 관리자 주소로 — 완전 삭제", () => {
    expect(deleteRequest({ id: "d1", mine: false, tool: "create", documentId: "d1", documentOwner: "u9" }, true).url)
      .toBe("/api/admin/pdp-documents/d1?owner=u9");
  });

  /** 회원 주소는 지운 때만 적는다. 관리자 자기 문서가 「회원이 삭제함」으로 남고 다시 못 지우게 된다(리뷰). */
  it("관리자는 자기 상세페이지 문서도 관리자 주소로 — 완전 삭제", () => {
    expect(deleteRequest({ id: "d1", mine: true, tool: "create", documentId: "d1", documentOwner: "a1" }, true).url)
      .toBe("/api/admin/pdp-documents/d1?owner=a1");
  });

  /** 캐릭터 표·각도 그림·참고 이미지를 함께 지우는 주소. 라이브러리 표로 보내면 한쪽만 사라진다. */
  it("캐릭터는 캐릭터 지우기 주소에 id 를 실어 — 관리자여도 같다(주인은 서버가 찾는다)", () => {
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

describe("지운 때 표시", () => {
  it("회원이 지운 때를 짧게 적는다", () => {
    expect(deletedLabel("2026-10-08T03:00:00.000Z")).toMatch(/^회원이 삭제함 · 10월 8일$/);
  });
});
