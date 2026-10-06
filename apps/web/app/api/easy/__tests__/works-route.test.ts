import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1" } }),
}));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({ listWorkConversations: async () => ({ p1: "c1", p2: "c2" }) }),
}));

const { GET } = await import("../works/route");

describe("내 쉽게 작업 목록 (2026-10-06 설계 C)", () => {
  it("작업 id 목록은 그대로 주고, 작업 → 대화를 함께 준다", async () => {
    expect(await (await GET()).json()).toEqual({ ok: true, workIds: ["p1", "p2"], conversations: { p1: "c1", p2: "c2" } });
  });
});
