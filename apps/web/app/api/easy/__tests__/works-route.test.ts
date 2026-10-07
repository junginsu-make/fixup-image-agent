import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let 던짐: Error | null = null;
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1" } }),
}));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    listWorkConversations: async () => {
      if (던짐) throw 던짐;
      return { p1: "c1", p2: "c2" };
    },
  }),
}));

const { GET } = await import("../works/route");

describe("내 쉽게 작업 목록 (2026-10-06 설계 C)", () => {
  it("작업 id 목록은 그대로 주고, 작업 → 대화를 함께 준다", async () => {
    expect(await (await GET()).json()).toEqual({ ok: true, workIds: ["p1", "p2"], conversations: { p1: "c1", p2: "c2" } });
  });
});

/** 2026-10-07 후속 Task 1 — 저장소의 날것 오류 글은 서버 기록에만 남긴다. */
describe("오류 글 가리기 (후속 Task 1)", () => {
  afterEach(() => { 던짐 = null; vi.restoreAllMocks(); });

  it("목록 읽기가 날것 오류로 실패하면 일반 문장을 500 으로 준다", async () => {
    const 기록 = vi.spyOn(console, "error").mockImplementation(() => {});
    던짐 = new Error('쉽게 작업 목록: permission denied for table "easy_messages"');
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, message: "쉽게 작업 목록을 읽지 못했습니다." });
    expect(기록).toHaveBeenCalledWith(expect.stringContaining("[easy]"), 던짐);
  });
});
