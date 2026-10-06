import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const st = vi.hoisted(() => ({
  local: true,
  reads: 0,
  rows: [] as Array<{ id: string; userId: string; costUsd: number | null }>,
  /** 운영 표가 줄 것. `Error` 면 읽기 실패다. */
  remote: [] as Array<{ id: string; cost_usd: number | null }> | Error,
  asked: [] as string[],
}));
vi.mock("../../local-store", () => ({
  isLocalStoreEnabled: () => st.local,
  getLocalDatabase: () => ({
    read: async (select: (data: unknown) => unknown) => { st.reads += 1; return select({ posterRequests: st.rows }); },
  }),
}));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        in: async (column: string, ids: string[]) => {
          st.asked = [table, columns, column, ...ids];
          if (st.remote instanceof Error) return { data: null, error: st.remote };
          return { data: st.remote.filter((row) => ids.includes(row.id)), error: null };
        },
      }),
    }),
  }),
}));

const { finishedOf, posterRequestsFinished } = await import("../pending-requests");

/**
 * **요청이 끝났는지**(2026-10-06 설계 B3 · B5, 최종 리뷰). 끝난 요청을 다시 물으면
 * `status` 가 결과를 또 저장하고 또 정산한다 — 끝났는지는 요청 줄의 `costUsd` 로 본다.
 * 끝났는데 그림이 없으면 다시 열 때 실패로 보인다. 못 읽은 것은 모른다(지도에 없다).
 */
beforeEach(() => {
  st.local = true; st.reads = 0; st.asked = [];
  st.rows = [
    { id: "r1", userId: "me", costUsd: null }, // 안 끝남
    { id: "r2", userId: "me", costUsd: 0 }, // 끝남 — 0장이어도 숫자다
    { id: "r3", userId: "me", costUsd: 0.04 }, // 끝남
    { id: "r4", userId: "other", costUsd: null }, // 남의 것
  ];
  st.remote = [
    { id: "r1", cost_usd: null },
    { id: "r2", cost_usd: 0 },
    { id: "r3", cost_usd: 0.04 },
  ];
});

describe("끝났는지", () => {
  it("costUsd 가 채워졌으면 끝났다 — 0 이어도", () => {
    expect(finishedOf([{ id: "a", costUsd: null }, { id: "b", costUsd: 0 }, { id: "c", costUsd: undefined }, { id: "d", costUsd: 0.04 }]))
      .toEqual(new Map([["a", false], ["b", true], ["c", false], ["d", true]]));
  });

  it("로컬: 내 요청만 읽는다 — 남의 것 · 모르는 것은 지도에 없다", async () => {
    expect(await posterRequestsFinished("me", ["r1", "r2", "r3", "r4", "r9"]))
      .toEqual(new Map([["r1", false], ["r2", true], ["r3", true]]));
  });

  it("운영: 회원 세션으로 cost_usd 를 읽어 costUsd 로 본다", async () => {
    st.local = false;
    expect(await posterRequestsFinished("me", ["r1", "r2", "r3", "r9"]))
      .toEqual(new Map([["r1", false], ["r2", true], ["r3", true]]));
    expect(st.asked).toEqual(["poster_generation_requests", "id,cost_usd", "id", "r1", "r2", "r3", "r9"]);
  });

  it("물을 요청이 없으면 저장소를 안 읽는다", async () => {
    expect(await posterRequestsFinished("me", [])).toEqual(new Map());
    expect(st.reads).toBe(0);
  });

  it("못 읽으면 빈 지도 — 모른다(이어 받지도, 실패로 보이지도 않는다)", async () => {
    st.local = false;
    st.remote = new Error("읽기 실패");
    expect(await posterRequestsFinished("me", ["r1"])).toEqual(new Map());
  });
});
