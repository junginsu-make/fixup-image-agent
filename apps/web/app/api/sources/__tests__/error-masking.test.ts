import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **수집 소스가 실패할 때 데이터베이스 원문을 화면에 보내지 않는다**(2026-10-07).
 *
 * 원문 대신 각 처리가 원래 쓰던 일반 문장을 주고 상태 코드는 그대로다. 입력 안내(400)는 그대로다.
 */

vi.mock("server-only", () => ({}));

let 저장소오류: unknown = null;

vi.mock("../../../../lib/access/disabled-api", () => ({ disabledRouteResponse: () => null }));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1", profile: { role: "member" } } }),
}));

const 던진다 = async () => {
  if (저장소오류) throw 저장소오류;
  return {};
};
vi.mock("../../../../lib/repository-factory", () => ({
  sourceServiceForUser: async () => ({ list: 던진다, create: 던진다, update: 던진다, remove: 던진다 }),
}));

const { GET, POST } = await import("../route");
const { PATCH, DELETE } = await import("../[id]/route");

const 원문 = 'duplicate key value violates unique constraint "content_sources_pkey"';
const 소스 = { kind: "rss", name: "n", url: "https://a.com", intervalHours: 6, maxItems: 20 };
const 본문 = (body: unknown, method = "POST") =>
  new Request("http://localhost/api/sources", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: "s1" }) };

beforeEach(() => {
  저장소오류 = new Error(원문);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("수집 소스 원문 가리기", () => {
  it.each([
    ["목록", () => GET(), "소스를 불러오지 못했습니다."],
    ["등록", () => POST(본문(소스)), "소스를 등록하지 못했습니다."],
    ["고치기", () => PATCH(본문({ enabled: false }, "PATCH"), params), "소스를 수정하지 못했습니다."],
    ["지우기", () => DELETE(new Request("http://localhost/api/sources/s1", { method: "DELETE" }), params), "소스를 삭제하지 못했습니다."],
  ])("%s: 원문 대신 일반 문장이고 500 그대로다", async (_이름, 부른다, 문장) => {
    const response = await 부른다();
    const body = (await response.json()) as { ok: boolean; message: string };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, message: 문장 });
  });

  it("입력 안내는 그대로다", async () => {
    const response = await POST(본문({ kind: "블로그" }));

    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toBe("소스 입력을 확인해 주세요.");
  });
});
