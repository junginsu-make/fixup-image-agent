import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **캐릭터 사본을 제목으로 지울 때 무엇이 지워지나**(2026-10-08 — 계획 2단계).
 *
 * 참고 이미지에는 캐릭터를 가리키는 칸이 없어 제목이 유일한 손잡이다. 지운 캐릭터의 이름은 다시 쓸 수 있으므로,
 * 같은 제목의 사본이 「보관 중인 옛 캐릭터 것」과 「새 캐릭터 것」으로 둘 다 있을 수 있다.
 * - 보통(각도 다시 만들기·살아 있는 캐릭터 완전 삭제)은 **살아 있는 사본만**
 * - 지운 캐릭터를 관리자가 완전히 지울 때는 **그 캐릭터와 같은 때 보관된 사본만**
 * 가짜 질의는 걸린 조건으로 실제로 거른다 — 조건을 바꾸면 시험이 깨져야 한다.
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, removedFiles: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("../local-store", async (original) => ({ ...(await original<object>()), isLocalStoreEnabled: () => false }));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let removing = false;
      const builder: Record<string, unknown> = {
        select: () => builder,
        delete: () => { removing = true; return builder; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
        is: (column: string, value: null) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
        then: (resolve: (value: unknown) => unknown) => {
          const hit = st.rows.filter((row) => filters.every((match) => match(row)));
          if (removing) st.rows = st.rows.filter((row) => !hit.includes(row));
          return Promise.resolve({ data: hit, error: null }).then(resolve);
        },
      };
      return builder;
    },
    storage: { from: () => ({ remove: async (paths: string[]) => { st.removedFiles.push(...paths); return { error: null }; } }) },
  }),
}));

const { removeReferenceImagesByTitle } = await import("../reference-images");

const TITLE = "호랑이 (캐릭터) · 정면";
const FIRST = "2026-09-01T00:00:00.000Z";
const SECOND = "2026-10-01T00:00:00.000Z";
const row = (id: string, deleted_at: string | null) => ({
  id, user_id: "me", title: TITLE, deleted_at, storage_path: `me/references/${id}.png`, thumb_path: null,
});

beforeEach(() => {
  st.removedFiles = [];
  st.rows = [row("live", null), row("first", FIRST), row("second", SECOND)];
});

describe("제목으로 사본 지우기", () => {
  it("보통은 살아 있는 사본만 — 보관 중인 옛 사본은 남는다", async () => {
    await removeReferenceImagesByTitle("me", TITLE);
    expect(st.rows.map((entry) => entry.id)).toEqual(["first", "second"]);
    expect(st.removedFiles).toEqual(["me/references/live.png"]);
  });

  it("지운 캐릭터를 완전히 지울 때는 그 캐릭터와 같은 때 보관된 사본만", async () => {
    await removeReferenceImagesByTitle("me", TITLE, FIRST);
    expect(st.rows.map((entry) => entry.id)).toEqual(["live", "second"]);
    expect(st.removedFiles).toEqual(["me/references/first.png"]);
  });
});
