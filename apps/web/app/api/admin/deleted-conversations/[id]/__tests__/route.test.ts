import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자만 회원이 지운 쉽게 대화를 열고 완전히 지운다**(2026-10-08 — 계획 2단계).
 *
 * 회원에게는 없는 주소처럼 답한다(관리자 확인 실패). id 모양이 아니면 DB 에 묻지 않는다. 지운 대화가 아니면 404.
 */
vi.mock("server-only", () => ({}));

const ID = "11111111-1111-4111-8111-111111111111";
const st = vi.hoisted(() => ({ admin: true, read: vi.fn(), purge: vi.fn() }));

vi.mock("../../../../../../lib/membership/api", () => ({
  authenticateApiAdmin: async () => (st.admin
    ? { ok: true, member: { userId: "a1", profile: { role: "admin" } } }
    : { ok: false, response: Response.json({ ok: false }, { status: 403 }) }),
}));
vi.mock("../../../../../../lib/easy/deleted-conversations", () => ({
  readDeletedConversation: st.read,
  purgeDeletedConversation: st.purge,
}));

const { GET, DELETE } = await import("../route");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (method: string) => new Request(`http://local/api/admin/deleted-conversations/${ID}`, { method });

beforeEach(() => {
  st.admin = true;
  st.read.mockReset();
  st.purge.mockReset();
});

describe("지운 쉽게 대화 — 관리자 주소", () => {
  it("관리자가 아니면 열지도 지우지도 않는다", async () => {
    st.admin = false;
    expect((await GET(request("GET"), ctx(ID))).status).toBe(403);
    expect((await DELETE(request("DELETE"), ctx(ID))).status).toBe(403);
    expect(st.read).not.toHaveBeenCalled();
    expect(st.purge).not.toHaveBeenCalled();
  });

  it("id 모양이 아니면 DB 에 묻지 않고 400", async () => {
    expect((await GET(request("GET"), ctx("abc"))).status).toBe(400);
    expect((await DELETE(request("DELETE"), ctx("abc"))).status).toBe(400);
    expect(st.read).not.toHaveBeenCalled();
    expect(st.purge).not.toHaveBeenCalled();
  });

  it("지운 대화의 내용을 준다", async () => {
    st.read.mockResolvedValue([{ id: "m1", body: "말" }]);
    const response = await GET(request("GET"), ctx(ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, messages: [{ id: "m1", body: "말" }] });
  });

  it("지운 대화가 아니면 404", async () => {
    st.read.mockResolvedValue(null);
    st.purge.mockResolvedValue(false);
    expect((await GET(request("GET"), ctx(ID))).status).toBe(404);
    expect((await DELETE(request("DELETE"), ctx(ID))).status).toBe(404);
  });

  it("완전히 지운다", async () => {
    st.purge.mockResolvedValue(true);
    expect((await DELETE(request("DELETE"), ctx(ID))).status).toBe(200);
    expect(st.purge).toHaveBeenCalledWith(ID);
  });

  it("DB 오류 원문은 화면에 안 보낸다", async () => {
    st.purge.mockRejectedValue(new Error('relation "easy_conversations" does not exist'));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await DELETE(request("DELETE"), ctx(ID));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("easy_conversations");
  });
});
