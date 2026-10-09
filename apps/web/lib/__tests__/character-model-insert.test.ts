import { describe, expect, it, vi } from "vitest";

/** 운영 저장(Supabase)에도 model_id 를 적는다(2026-10-07). */
let inserted: Record<string, unknown> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const self: Record<string, unknown> = {
        select: () => self,
        eq: () => self,
        // 이름 목록은 살아 있는 캐릭터만 읽는다(`is("deleted_at", null)`, 2026-10-08) — 거기서 끝난다.
        is: async () => ({ data: [], error: null }),
        // 적힌 값만 보고 멈춘다 — 그 뒤 저장소 일은 이 시험의 몫이 아니다.
        insert: async (payload: Record<string, unknown>) => { inserted = payload; return { error: { message: "멈춤" } }; },
      };
      return self;
    },
  }),
}));

const { createCharacter } = await import("../characters");

describe("운영 저장", () => {
  it("만든 모델을 model_id 칸에 적는다", async () => {
    await createCharacter({
      userId: "u1", name: "민지", description: "민지", aspectRatio: "3:4", kind: "person", look: "anime",
      chosenBase64: "AAAA", chosenMimeType: "image/png", angles: [], sheet: false,
    });
    expect(inserted?.model_id).toBe("gpt-image-2.5-flare");
  });
});
