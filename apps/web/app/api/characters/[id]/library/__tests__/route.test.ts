import { beforeEach, describe, expect, it, vi } from "vitest";

/** 라이브러리 사본 다시 채우기 — 입구에서 거르는 것. 그림을 새로 그리지 않으니 크레딧은 없다. */
const restore = vi.fn();

vi.mock("server-only", () => ({}));
const auth = vi.fn();
vi.mock("../../../../../../lib/membership/api", () => ({
  authenticateApiMember: () => auth(),
}));
vi.mock("../../../../../../lib/characters", () => ({
  restoreCharacterReferences: (...args: unknown[]) => restore(...args),
}));

const { POST } = await import("../route");

function call(body: unknown) {
  return POST(
    new Request("http://local/api/characters/c1/library", { method: "POST", body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "c1" }) },
  );
}

beforeEach(() => {
  restore.mockReset();
  auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
});

describe("POST /api/characters/[id]/library", () => {
  it("요청한 회원의 것으로 채우고 결과를 돌려준다", async () => {
    restore.mockResolvedValue({ restored: ["front"], unavailable: [] });
    const response = await call({ angles: ["front"] });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, restored: ["front"], unavailable: [] });
    expect(restore).toHaveBeenCalledWith("u1", "c1", ["front"]);
  });

  it("로그인하지 않았으면 채우지 않는다", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await call({ angles: ["front"] })).status).toBe(401);
    expect(restore).not.toHaveBeenCalled();
  });

  it("내 캐릭터가 아니면 404", async () => {
    restore.mockResolvedValue(null);
    expect((await call({ angles: ["front"] })).status).toBe(404);
  });

  it("각도 목록이 없거나 너무 길면 400", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call({ angles: Array(20).fill("front") })).status).toBe(400);
    expect(restore).not.toHaveBeenCalled();
  });
});
