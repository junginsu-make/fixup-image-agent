import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자가 복사한 캐릭터도 이름이 겹치지 않는다**(2026-10-07).
 *
 * 복사본은 관리자 계정에 들어간다. 원본 이름을 그대로 쓰면 관리자에게 같은
 * 이름이 생기고, 라이브러리는 이름으로 찾아 지우므로 하나를 지울 때 다른 쪽
 * 그림까지 지워진다.
 */
let inserted: Record<string, unknown> | null = null;
let mine: Array<{ name: string }> = [];

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../../lib/supabase/admin", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {
      select: () => self, eq: () => self, update: () => self,
      insert: (payload: Record<string, unknown>) => { if (table === "characters") inserted = payload; return self; },
      maybeSingle: async () => ({ data: { id: "원본", user_id: "회원A", name: "나" }, error: null }),
      single: async () => ({ data: { id: "새캐릭터" }, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: table === "characters" ? mine : [], error: null })),
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

beforeEach(() => { inserted = null; });

describe("copyCharacterToSelf 이름", () => {
  it("관리자에게 같은 이름이 없으면 그대로", async () => {
    mine = [];
    await copyCharacterToSelf("원본", "관리자B");
    expect(inserted?.name).toBe("나");
  });

  it("관리자에게 같은 이름이 있으면 (2) 를 붙인다", async () => {
    mine = [{ name: "나" }];
    await copyCharacterToSelf("원본", "관리자B");
    expect(inserted?.name).toBe("나 (2)");
  });
});
