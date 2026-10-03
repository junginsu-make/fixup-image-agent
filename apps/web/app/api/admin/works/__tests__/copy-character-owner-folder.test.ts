import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자가 캐릭터를 복사할 때 원본 주인의 폴더 밖 위치는 가져오지 않는다**(2026-10-03 보안 리뷰).
 *
 * 회원이 자기 각도 줄의 위치를 남의 그림 위치로 고쳐 쓸 수 있었다(DB 는 202610030002 로 막았다).
 * 관리자가 그 캐릭터를 복사하면 남의 그림이 관리자 사본으로 끌려왔다.
 */
const downloads: string[] = [];
let views: Array<Record<string, unknown>> = [];

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../../lib/supabase/admin", () => {
  const builder = (table: string) => {
    const self: Record<string, unknown> = {
      select: () => self, eq: () => self, insert: () => self, update: () => self,
      maybeSingle: async () => ({ data: { id: "원본", user_id: "회원A", name: "나" }, error: null }),
      single: async () => ({ data: { id: "새캐릭터" }, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: table === "character_views" ? views : [], error: null })),
    };
    return self;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: builder,
      storage: {
        from: () => ({
          download: async (path: string) => {
            downloads.push(path);
            return { data: { arrayBuffer: async () => new ArrayBuffer(8) }, error: null };
          },
          upload: async () => ({ error: null }),
        }),
      },
    }),
  };
});

const { copyCharacterToSelf } = await import("../store");

beforeEach(() => {
  downloads.length = 0;
});

describe("copyCharacterToSelf", () => {
  it("원본 주인의 폴더 안 각도만 내려받는다", async () => {
    views = [
      { angle: "front", path: "회원A/원본/front.png", thumb_path: "회원A/원본/%2e%2e/%2e%2e/회원C/c9/front.thumb.webp" },
      { angle: "back", path: "회원C/c9/back.png", thumb_path: null },
    ];
    await copyCharacterToSelf("원본", "관리자B");
    expect(downloads).toEqual(["회원A/원본/front.png"]);
  });
});
