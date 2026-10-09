import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 지운 참고 이미지 보관**(2026-10-08 — 계획 2단계). 서버 권한으로 쓰므로 **주인·살아 있는 것만** 고르는
 * 조건이 유일한 방어선이다. 가짜 질의는 걸린 조건으로 실제로 거른다.
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, fail: false, removedFiles: [] as string[] }));

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Row = {};
      let removing = false;
      const builder: Record<string, unknown> = {
        update: (values: Row) => { patch = values; return builder; },
        delete: () => { removing = true; return builder; },
        not: (column: string, _op: string, value: null) => { filters.push((row) => (row[column] ?? null) !== value); return builder; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
        is: (column: string, value: null) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
        lt: (column: string, value: string) => { filters.push((row) => String(row[column]) < value); return builder; },
        select: () => builder,
        then: (resolve: (value: unknown) => unknown) => {
          if (st.fail) return Promise.resolve({ data: null, error: { message: 'column "deleted_by" does not exist' } }).then(resolve);
          const hit = st.rows.filter((row) => filters.every((match) => match(row)));
          st.rows = removing
            ? st.rows.filter((row) => !hit.includes(row))
            : st.rows.map((row) => (hit.includes(row) ? { ...row, ...patch } : row));
          return Promise.resolve({ data: hit.map((row) => ({ id: row.id })), error: null }).then(resolve);
        },
      };
      return builder;
    },
    storage: { from: () => ({ remove: async (paths: string[]) => { st.removedFiles.push(...paths); return { error: null }; } }) },
  }),
}));

const { purgeReferenceImage, softDeleteReferenceImage, softDeleteReferenceImagesByTitle } = await import("../reference-soft-delete");

const OLD = "2026-09-01T00:00:00.000Z";
beforeEach(() => {
  st.fail = false;
  st.removedFiles = [];
  st.rows = [
    { id: "mine", user_id: "me", title: "호랑이 (캐릭터) · 정면", deleted_at: null },
    { id: "theirs", user_id: "other", title: "호랑이 (캐릭터) · 정면", deleted_at: null },
    { id: "kept", user_id: "me", title: "호랑이 (캐릭터) · 정면", deleted_at: OLD },
  ];
});

describe("참고 이미지 한 장 보관", () => {
  it("내 살아 있는 그림에만 지운 때·지운 사람을 적는다", async () => {
    expect(await softDeleteReferenceImage("me", "mine")).toBe(true);
    expect(st.rows[0]).toMatchObject({ deleted_by: "me" });
    expect(await softDeleteReferenceImage("me", "theirs")).toBe(false);
    expect(await softDeleteReferenceImage("me", "kept")).toBe(false);
    expect(st.rows[1]!.deleted_at).toBeNull();
    expect(st.rows[2]!.deleted_at).toBe(OLD);
  });

  it("DB 원문은 화면 문구로 안 나간다", async () => {
    st.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(softDeleteReferenceImage("me", "mine")).rejects.toThrow("참고 이미지를 지우지 못했습니다.");
  });
});

describe("캐릭터의 라이브러리 사본 보관", () => {
  it("내 살아 있는 사본만, 캐릭터와 같은 지운 때로 — 예전에 보관된 사본의 때는 안 바꾼다", async () => {
    const at = "2026-10-08T00:00:00.000Z";
    await softDeleteReferenceImagesByTitle("me", ["호랑이 (캐릭터) · 정면"], at);
    expect(st.rows.map((row) => [row.id, row.deleted_at])).toEqual([["mine", at], ["theirs", null], ["kept", OLD]]);
  });

  it("「이 때보다 먼저 생긴 것만」을 주면 나중에 생긴 같은 제목 사본은 그대로 둔다", async () => {
    st.rows = [
      { id: "old-copy", user_id: "me", title: "호랑이 (캐릭터) · 정면", deleted_at: null, created_at: "2026-08-01T00:00:00.000Z" },
      { id: "new-copy", user_id: "me", title: "호랑이 (캐릭터) · 정면", deleted_at: null, created_at: "2026-09-15T00:00:00.000Z" },
    ];
    await softDeleteReferenceImagesByTitle("me", ["호랑이 (캐릭터) · 정면"], OLD, OLD);
    expect(st.rows.map((row) => [row.id, row.deleted_at])).toEqual([["old-copy", OLD], ["new-copy", null]]);
  });
});

/**
 * **6개월 지난 참고 이미지 완전 삭제**(3단계). 사람이 보지 않고 도는 일이라 두 가지를 지킨다 — 줄이 정말 지워졌을
 * 때만 파일을 지우고, 주인 폴더 밖의 파일은 절대 안 지운다(옛 줄에 남의 경로가 들어 있을 수 있다, 리뷰).
 */
describe("참고 이미지 완전 삭제(자동 파기)", () => {
  it("회원이 지운 줄과 그 파일·사본을 지운다", async () => {
    await purgeReferenceImage({ id: "kept", owner: "me", storagePath: "me/references/kept.png", thumbPath: "me/references/kept.thumb.webp" });
    expect(st.rows.map((row) => row.id)).toEqual(["mine", "theirs"]);
    expect(st.removedFiles).toEqual(["me/references/kept.png", "me/references/kept.thumb.webp"]);
  });

  it("살아 있는 줄이면 아무것도 안 지운다 — 파일도", async () => {
    await purgeReferenceImage({ id: "mine", owner: "me", storagePath: "me/references/mine.png", thumbPath: null });
    expect(st.rows).toHaveLength(3);
    expect(st.removedFiles).toEqual([]);
  });

  it("주인 폴더 밖의 파일은 안 지운다", async () => {
    await purgeReferenceImage({ id: "kept", owner: "me", storagePath: "other/references/x.png", thumbPath: "me/../other/y.webp" });
    expect(st.removedFiles).toEqual([]);
  });
});
