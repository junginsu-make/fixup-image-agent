import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **전체 작업물 목록이 실패할 때 데이터베이스 원문을 화면에 보내지 않는다**(2026-10-07).
 *
 * 라이브러리의 「전체 회원 보기」는 `message` 를 그대로 띄운다(`works-tab.tsx`). 표 이름이 섞인
 * 원문 대신 이 라우트가 원래 쓰던 일반 문장을 주고, 상태 코드는 500 그대로다.
 */

vi.mock("server-only", () => ({}));

let 관리자다 = true;
let 목록오류: unknown = null;

vi.mock("../../../../../lib/membership/api", () => ({
  authenticateApiAdmin: async () =>
    관리자다
      ? { ok: true, member: { userId: "admin-1", profile: { role: "admin" } } }
      : { ok: false, response: Response.json({ ok: false, message: "관리자만 볼 수 있습니다." }, { status: 403 }) },
}));

vi.mock("../store", () => ({
  listAllWorks: async () => {
    if (목록오류) throw 목록오류;
    return { sns: [], poster: [], easyWorkIds: [] };
  },
}));

const { GET } = await import("../route");

beforeEach(() => {
  관리자다 = true;
  목록오류 = null;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("GET /api/admin/works 실패", () => {
  it("데이터베이스 원문 대신 일반 문장이고 500 그대로다", async () => {
    목록오류 = new Error('relation "poster_projects" does not exist');

    const response = await GET();
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, message: "작업물을 불러오지 못했습니다." });
  });

  it("관문의 응답은 그대로다", async () => {
    관리자다 = false;

    const response = await GET();

    expect(response.status).toBe(403);
    expect(((await response.json()) as { message: string }).message).toBe("관리자만 볼 수 있습니다.");
  });
});
