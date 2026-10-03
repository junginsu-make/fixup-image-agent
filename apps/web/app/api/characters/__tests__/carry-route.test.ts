import { beforeEach, describe, expect, it, vi } from "vitest";

/** 옮겨 담기 경로가 본문을 거르고, 못 찾음을 404 로 바꾸는가. */

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
}));
const carry = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../../../lib/character-carry", () => {
  class CharacterCarryNotFound extends Error {}
  return { CharacterCarryNotFound, carryCharacterViews: carry.fn };
});

const { POST } = await import("../[id]/carry/route");
const { CharacterCarryNotFound } = await import("../../../../lib/character-carry");

function 요청(body: unknown) {
  return new Request("http://localhost/api/characters/B/carry", {
    method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });
}
const 자리 = { params: Promise.resolve({ id: "B" }) };

beforeEach(() => carry.fn.mockReset());

describe("POST /api/characters/[id]/carry", () => {
  it("세션 사용자·주소의 id·본문의 fromId 로 부르고 옮긴 각도를 돌려준다", async () => {
    carry.fn.mockResolvedValue({ carried: ["back"], failed: [] });
    const response = await POST(요청({ fromId: "A" }), 자리);
    expect(carry.fn).toHaveBeenCalledWith({ userId: "u1", fromId: "A", toId: "B" });
    expect(await response.json()).toEqual({ ok: true, carried: ["back"], failed: [] });
  });

  it("실패한 각도와 라이브러리 등록 오류도 돌려준다", async () => {
    carry.fn.mockResolvedValue({ carried: [], failed: ["back"], referenceIssue: "옮겨 담은 각도를 라이브러리에 넣지 못했습니다." });
    const response = await POST(요청({ fromId: "A" }), 자리);
    expect(await response.json()).toEqual({ ok: true, carried: [], failed: ["back"], referenceIssue: "옮겨 담은 각도를 라이브러리에 넣지 못했습니다." });
  });

  it("본문에 fromId 가 없으면 400 이고 부르지 않는다", async () => {
    const response = await POST(요청({}), 자리);
    expect(response.status).toBe(400);
    expect(carry.fn).not.toHaveBeenCalled();
  });

  it("못 찾으면 404", async () => {
    carry.fn.mockRejectedValueOnce(new CharacterCarryNotFound());
    const response = await POST(요청({ fromId: "C" }), 자리);
    expect(response.status).toBe(404);
  });

  it("그 밖의 오류는 500 이고 내부 문구를 흘리지 않는다", async () => {
    carry.fn.mockRejectedValueOnce(new Error("relation character_views does not exist"));
    const response = await POST(요청({ fromId: "A" }), 자리);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("relation");
  });
});
