import { describe, expect, it, vi } from "vitest";

/** 관리자가 복사한 캐릭터도 **만든 모델**을 그대로 가져간다(2026-10-07). 빠지면 복사본의 빠진 장면이 다른 모델로 그려진다. */
let inserted: Record<string, unknown> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../../lib/supabase/admin", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {
      select: () => self, eq: () => self, update: () => self,
      insert: (payload: Record<string, unknown>) => { if (table === "characters") inserted = payload; return self; },
      maybeSingle: async () => ({
        data: { id: "원본", user_id: "회원A", name: "나", model_id: "gpt-image-2.5-flare" }, error: null,
      }),
      single: async () => ({ data: { id: "새캐릭터" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
    };
    return self;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: builder,
      storage: { from: () => ({ download: async () => ({ data: null, error: null }), upload: async () => ({ error: null }) }) },
    }),
  };
});

const { copyCharacterToSelf } = await import("../store");

describe("copyCharacterToSelf 모델", () => {
  it("원본의 model_id 를 복사본에 적는다", async () => {
    await copyCharacterToSelf("원본", "관리자B");
    expect(inserted?.model_id).toBe("gpt-image-2.5-flare");
  });
});
