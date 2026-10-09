import { describe, expect, it, vi } from "vitest";

/**
 * 이름이 겹치는지 보려고 목록을 읽다 실패하면 **DB 오류 원문을 화면에 내지 않는다**
 * (2026-10-07 리뷰). 원문은 서버 기록에만 남긴다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        // 이름 목록은 살아 있는 캐릭터만 읽는다(`is("deleted_at", null)`, 2026-10-08) — 거기서 끝난다.
        is: async () => ({ data: null, error: { message: "relation \"characters\" permission denied for schema public" } }),
        insert: () => { throw new Error("이름을 못 읽었는데 저장하면 안 된다"); },
      };
      return self;
    },
  }),
}));

const { createCharacter } = await import("../characters");

describe("이름 목록을 못 읽을 때", () => {
  it("쉬운 말로 알리고 저장하지 않는다", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createCharacter({
      userId: "u1", name: "민지", description: "민지", aspectRatio: "3:4", kind: "person", look: "photoreal",
      chosenBase64: "AAAA", chosenMimeType: "image/png", angles: [], sheet: false,
    })).rejects.toThrow("캐릭터 목록을 확인하지 못했습니다. 잠시 뒤 다시 저장해 주세요.");
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
