import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  local: true,
  reads: 0,
  rows: [] as Array<{ id: string; userId: string; costUsd: number | null }>,
}));
vi.mock("../../local-store", () => ({
  isLocalStoreEnabled: () => st.local,
  getLocalDatabase: () => ({
    read: async (select: (data: unknown) => unknown) => { st.reads += 1; return select({ posterRequests: st.rows }); },
  }),
}));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => { throw new Error("운영 저장소는 이 시험에서 안 쓴다"); },
}));

const { unfinishedOf, unfinishedPosterRequests } = await import("../pending-requests");

/**
 * **아직 결과를 안 받은 요청**(2026-10-06 설계 B3, 최종 리뷰). 끝난 요청을 다시 물으면
 * `status` 가 결과를 또 저장하고 또 정산한다 — 끝났는지는 요청 줄의 `costUsd` 로 본다.
 */
beforeEach(() => {
  st.local = true; st.reads = 0;
  st.rows = [
    { id: "r1", userId: "me", costUsd: null }, // 안 끝남
    { id: "r2", userId: "me", costUsd: 0 }, // 끝남 — 0장이어도 숫자다
    { id: "r3", userId: "me", costUsd: 0.04 }, // 끝남
    { id: "r4", userId: "other", costUsd: null }, // 남의 것
  ];
});

describe("끝났는지", () => {
  it("costUsd 가 비어 있는 것만 안 끝났다", () => {
    expect(unfinishedOf([{ id: "a", costUsd: null }, { id: "b", costUsd: 0 }, { id: "c", costUsd: undefined }]))
      .toEqual(new Set(["a", "c"]));
  });

  it("내 요청 가운데 안 끝난 것만 준다 — 끝난 것 · 남의 것 · 모르는 것은 아니다", async () => {
    expect(await unfinishedPosterRequests("me", ["r1", "r2", "r3", "r4", "r9"])).toEqual(new Set(["r1"]));
  });

  it("물을 요청이 없으면 저장소를 안 읽는다", async () => {
    expect(await unfinishedPosterRequests("me", [])).toEqual(new Set());
    expect(st.reads).toBe(0);
  });

  it("못 읽으면 빈 목록 — 이어 받지 않는다", async () => {
    st.local = false;
    expect(await unfinishedPosterRequests("me", ["r1"])).toEqual(new Set());
  });
});
