import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자가 카드뉴스를 지울 때 그 작업 주인의 폴더 밖 위치는 지우지 않는다**(2026-10-03 보안 리뷰).
 *
 * 카드 위치는 작업 데이터(`sns_projects.data`)에 들어 있고, 회원이 그 칸을 직접 고칠 수 있다.
 * 남의 그림 위치를 적어 둔 작업을 관리자가 지우면, 서버 권한 삭제가 남의 파일을 지웠다.
 * (회원 본인 삭제는 회원 토큰으로 지워 저장소 규칙이 자기 폴더로 묶는다.)
 */
const removed: string[][] = [];
let project: Record<string, unknown> | null = null;

vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../../lib/supabase/admin", () => {
  const builder = () => {
    const self: Record<string, unknown> = {
      select: () => self, eq: () => self, delete: () => self,
      maybeSingle: async () => ({ data: project, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })),
    };
    return self;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: builder,
      storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return { error: null }; } }) },
    }),
  };
});

const { deleteAnyWork } = await import("../store");

beforeEach(() => {
  removed.length = 0;
});

describe("deleteAnyWork — 카드뉴스", () => {
  it("작업 주인의 폴더 안 위치만 지운다", async () => {
    project = {
      user_id: "회원A",
      data: { flow: { cards: [
        { assetPath: "회원A/sns/p1/1.png", thumbPath: "회원A/sns/p1/%2e%2e/%2e%2e/회원C/sns/x/1.thumb.webp" },
        { assetPath: "회원C/sns/x/2.png", thumbPath: "회원A/sns/p1/2.thumb.webp" },
      ] } },
    };
    expect(await deleteAnyWork("sns", "p1")).toBe(true);
    expect(removed.flat()).toEqual(["회원A/sns/p1/1.png", "회원A/sns/p1/2.thumb.webp"]);
  });
});
