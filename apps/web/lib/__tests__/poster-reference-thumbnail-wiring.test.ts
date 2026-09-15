import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 포스터 레퍼런스도 **사본을 쓴다.**
 *
 * `reference-wiring.test.ts` 가 지키는 규약("격자는 사본, 확대·fal 전달은
 * 원본")이 포스터 쪽에서는 지켜지지 않았다. 표에는 `thumb_path` 가 적혀
 * 있는데 읽는 질의가 그 칸을 아예 고르지 않아, 불러오기 창이 2MB 짜리
 * 원본을 스무 장씩 받았다(2026-09-15 확인: 사본 68KB · 원본 2,199KB).
 *
 * **실패 신호가 없는 종류의 사고다.** 화면은 멀쩡히 뜨고 느리기만 하다.
 */

vi.mock("server-only", () => ({}));

let listRows: Array<Record<string, unknown>> = [];
let selectedColumns = "";
let signedPaths: string[] = [];

function builder() {
  const self: Record<string, unknown> = {
    select: (columns: string) => { selectedColumns = columns; return self; },
    eq: () => self,
    or: () => self,
    in: () => self,
    order: () => self,
    then: (resolve: (x: unknown) => unknown) =>
      Promise.resolve(resolve({ data: listRows, error: null })),
  };
  return self;
}

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: () => builder() }),
}));

vi.mock("../storage/signing", () => ({
  signPaths: async (_bucket: string, paths: readonly string[]) => {
    signedPaths = [...paths];
    return new Map(paths.map((path) => [path, `signed:${path}`]));
  },
}));

vi.mock("../teams/scope", () => ({
  scopedRead: <Q,>(query: Q) => query,
}));

vi.mock("../teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../teams/current-project", () => ({ selectedProjectFor: async () => null }));

const { createSupabasePosterReferenceStore } = await import("../poster/supabase-store");

beforeEach(() => {
  listRows = [];
  selectedColumns = "";
  signedPaths = [];
});

describe("포스터 레퍼런스 목록 — 사본 배선", () => {
  it("사본 자리를 질의에서 고른다", async () => {
    // 칸을 안 고르면 행에 값이 안 실려 온다. 그러면 아래 서명도 못 한다.
    listRows = [{
      id: "r1", storage_path: "u1/references/r1.png",
      thumb_path: "u1/references/r1.thumb.webp",
      title: "겨울", width: null, height: null, created_at: "2026-01-01",
    }];

    await createSupabasePosterReferenceStore("u1").list();

    expect(selectedColumns).toContain("thumb_path");
  });

  it("원본과 사본을 함께 서명해 둘 다 돌려준다", async () => {
    listRows = [{
      id: "r1", storage_path: "u1/references/r1.png",
      thumb_path: "u1/references/r1.thumb.webp",
      title: "겨울", width: null, height: null, created_at: "2026-01-01",
    }];

    const [reference] = await createSupabasePosterReferenceStore("u1").list();

    expect(signedPaths.sort()).toEqual([
      "u1/references/r1.png",
      "u1/references/r1.thumb.webp",
    ]);
    // 격자는 사본, 확대·fal 전달은 원본이다.
    expect(reference!.url).toBe("signed:u1/references/r1.png");
    expect(reference!.thumbUrl).toBe("signed:u1/references/r1.thumb.webp");
  });

  it("사본이 없는 옛 항목은 비어 있다", async () => {
    // 여기서 원본으로 **떨어지지 않게** 한다. 떨어뜨리면 화면 쪽에서
    // 사본인지 원본인지 구분할 수 없어진다.
    listRows = [{
      id: "r1", storage_path: "u1/references/r1.png", thumb_path: null,
      title: null, width: null, height: null, created_at: "2026-01-01",
    }];

    const [reference] = await createSupabasePosterReferenceStore("u1").list();

    expect(reference!.thumbUrl).toBeNull();
    expect(reference!.url).toBe("signed:u1/references/r1.png");
    expect(signedPaths).toEqual(["u1/references/r1.png"]);
  });
});
