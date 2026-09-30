import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **카드뉴스 작업 찾기는 내 것만**(2단계 §7 · §8).
 *
 * 카드뉴스 저장소는 팀 읽기 규칙 덕에 팀원의 작업도 읽어 온다(`sns-flow-store.ts`).
 * 팀 기능은 잠들어 있어도 그 규칙은 살아 있다. 다시 쓰기 · 다시 열기는 내 것만 본다.
 */

vi.mock("server-only", () => ({}));

let 작업들: Record<string, { id: string; userId: string }>;

vi.mock("../../sns-flow-store", () => ({
  snsFlowStoreForUser: async () => ({ get: async (id: string) => 작업들[id] }),
}));
vi.mock("../../sns/runtime", () => ({ refreshProjectAssetUrls: async (p: unknown) => p }));
vi.mock("../../../app/api/sns/projects/route", () => ({ POST: async () => Response.json({}) }));
vi.mock("../../../app/api/sns/projects/[id]/plan/route", () => ({ POST: async () => Response.json({}) }));
vi.mock("../../../app/api/sns/projects/[id]/generate/route", () => ({ POST: async () => Response.json({}) }));

const { cardnewsProject, lastCardnewsProject } = await import("../cardnews-steps");

beforeEach(() => {
  작업들 = { mine: { id: "mine", userId: "me" }, theirs: { id: "theirs", userId: "other" } };
});

describe("카드뉴스 작업 찾기", () => {
  it("내 작업은 찾는다", async () => {
    expect((await cardnewsProject("me", "mine"))?.id).toBe("mine");
  });

  it("남의 작업은 없는 것으로 본다", async () => {
    expect(await cardnewsProject("me", "theirs")).toBeNull();
  });

  it("없는 작업(포스터 작업)은 없는 것으로 본다", async () => {
    expect(await cardnewsProject("me", "poster-1")).toBeNull();
  });

  it("대화의 마지막 카드뉴스 작업을 뒤에서부터 찾고, 남의 것은 건너뛴다", async () => {
    const rows = [
      { role: "image", workId: "mine" },
      { role: "image", workId: "theirs" },
      { role: "image", workId: "poster-1" },
      { role: "user", workId: null },
    ];
    expect((await lastCardnewsProject("me", rows))?.id).toBe("mine");
  });
});
