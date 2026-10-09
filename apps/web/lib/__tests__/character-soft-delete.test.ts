import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 지운 캐릭터는 보관한다**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 회원이 지우면 캐릭터 줄·각도 줄·그림 파일은 남고 지운 때·지운 사람만 적힌다. 라이브러리에 들어간 각도 사본도
 * **같은 때**로 보관된다. 회원 화면·만들기 재료에서는 사라지고, 관리자는 「회원이 삭제한 자료」에서 보고 완전히
 * 지운다. 완전 삭제는 그 캐릭터와 함께 보관된 사본만 지운다 — 같은 이름의 새 캐릭터 사본을 건드리지 않게.
 *
 * 캐릭터는 서버 권한으로만 읽으므로(RLS 가 안 막는다) **질의의 거르기가 유일한 방어선**이다. 가짜 질의는 걸린
 * 조건으로 실제로 거른다 — 조건을 지우면 시험이 깨져야 한다.
 */
const me = "75000000-0000-4000-8000-00000000000a";
const other = "75000000-0000-4000-8000-00000000000b";
const GONE = "2026-10-08T00:00:00.000Z";

type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  removedFiles: [] as string[][],
  softRefs: [] as Array<{ userId: string; titles: readonly string[]; deletedAt: string; createdBefore?: string }>,
  hardRefs: [] as Array<{ userId: string; title: string; deletedAt: string | null }>,
}));

vi.mock("server-only", () => ({}));
vi.mock("../pdp/fal", () => ({ createPdpImageGenerator: () => async () => ({ base64: "", mimeType: "image/png" }) }));
vi.mock("../reference-images", () => ({
  emailsByUserId: async () => new Map(),
  saveReferenceImage: async () => undefined,
  referenceTitlesOf: async () => new Set(),
  removeReferenceImagesByTitle: async (userId: string, title: string, deletedAt: string | null = null) => {
    st.hardRefs.push({ userId, title, deletedAt });
  },
}));
vi.mock("../reference-soft-delete", () => ({
  softDeleteReferenceImagesByTitle: async (userId: string, titles: readonly string[], deletedAt: string, createdBefore?: string) => {
    st.softRefs.push({ userId, titles, deletedAt, createdBefore });
  },
}));
vi.mock("../supabase/admin", () => {
  const query = (table: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    let removing = false;
    const hit = () => (st.tables[table] ?? []).filter((row) => filters.every((match) => match(row)));
    const run = () => {
      const rows = hit();
      if (patch) {
        const values = patch;
        st.tables[table] = (st.tables[table] ?? []).map((row) => (rows.includes(row) ? { ...row, ...values } : row));
        return { data: rows.map((row) => ({ ...row, ...values })), error: null };
      }
      if (removing) {
        st.tables[table] = (st.tables[table] ?? []).filter((row) => !rows.includes(row));
        return { data: null, error: null };
      }
      return { data: rows, error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      or: () => builder,
      update: (values: Row) => { patch = values; return builder; },
      delete: () => { removing = true; return builder; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
      is: (column: string, value: null) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
      not: (column: string, _op: string, value: null) => { filters.push((row) => (row[column] ?? null) !== value); return builder; },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
  };
  return {
    createSupabaseAdminClient: () => ({
      from: query,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })) }),
          download: async (path: string) => ({ data: new Blob([path]) }),
          remove: async (paths: string[]) => { st.removedFiles.push(paths); return { data: [], error: null }; },
        }),
      },
    }),
  };
});

const { listCharacters, loadCharacterView, deleteCharacter } = await import("../characters");
const { softDeleteCharacter } = await import("../character-soft-delete");

const character = (id: string, user_id: string, name: string, deleted_at: string | null = null) => ({
  id, user_id, name, source_prompt: "p", identity_prompt: "p", created_at: "2026-10-01", deleted_at,
});
const view = (character_id: string, user_id: string) => ({
  character_id, user_id, angle: "front", path: `${user_id}/${character_id}/front.png`, thumb_path: null, mime_type: "image/png",
});

beforeEach(() => {
  delete process.env.LOCAL_STORE;
  st.tables = {
    characters: [character("c-live", me, "살아 있는"), character("c-gone", me, "지운", GONE), character("c-other", other, "남의")],
    character_views: [view("c-live", me), view("c-gone", me), view("c-other", other)],
  };
  st.removedFiles = [];
  st.softRefs = [];
  st.hardRefs = [];
});

describe("회원이 캐릭터를 지우면", () => {
  it("줄·각도·파일은 남고 지운 때·지운 사람만 적힌다", async () => {
    expect(await softDeleteCharacter(me, "c-live")).toEqual({ ok: true });
    const row = st.tables.characters!.find((entry) => entry.id === "c-live")!;
    expect(row.deleted_by).toBe(me);
    expect(row.deleted_at).toEqual(expect.any(String));
    expect(st.tables.character_views).toHaveLength(3);
    expect(st.removedFiles).toEqual([]);
  });

  it("라이브러리의 각도 사본도 **같은 때**로 보관한다", async () => {
    await softDeleteCharacter(me, "c-live");
    const row = st.tables.characters!.find((entry) => entry.id === "c-live")!;
    expect(st.softRefs).toHaveLength(1);
    expect(st.softRefs[0]!.userId).toBe(me);
    expect(st.softRefs[0]!.deletedAt).toBe(row.deleted_at);
    expect(st.softRefs[0]!.titles).toContain("살아 있는 (캐릭터) · 정면");
  });

  it("남의 것은 못 찾는다 — 아무것도 안 바뀐다", async () => {
    expect(await softDeleteCharacter(me, "c-other")).toMatchObject({ ok: false, notFound: true });
    expect(st.tables.characters!.find((entry) => entry.id === "c-other")!.deleted_at).toBeNull();
    expect(st.softRefs).toEqual([]);
  });

  /**
   * 사본을 보관하다 중간에 실패하면 500 이 나가고, 다시 누르면 캐릭터는 이미 지운 상태다. 거기서 404 로 끝내면 남은
   * 사본이 회원 화면에 영영 남는다(리뷰) — **처음 지운 때로** 사본 보관을 다시 돌려 마저 끝낸다.
   */
  it("이미 지운 내 캐릭터를 다시 지우면 처음 지운 때로 사본 보관을 마저 끝낸다", async () => {
    expect(await softDeleteCharacter(me, "c-gone")).toEqual({ ok: true });
    expect(st.tables.characters!.find((entry) => entry.id === "c-gone")!.deleted_at).toBe(GONE);
    expect(st.softRefs).toHaveLength(1);
    expect(st.softRefs[0]!.deletedAt).toBe(GONE);
    expect(st.softRefs[0]!.titles).toContain("지운 (캐릭터) · 정면");
  });

  /**
   * 그 사이 같은 이름으로 새 캐릭터를 만들었으면 사본 제목이 같다. 처음 지운 때보다 **나중에 생긴 사본은 건드리지
   * 않는다** — 안 그러면 새 캐릭터의 사본이 옛 캐릭터와 함께 보관되고, 옛 것을 완전히 지울 때 함께 지워진다(재리뷰).
   */
  it("다시 지울 때는 처음 지운 때보다 먼저 생긴 사본만 — 같은 이름의 새 캐릭터 사본은 그대로", async () => {
    await softDeleteCharacter(me, "c-gone");
    expect(st.softRefs[0]!.createdBefore).toBe(GONE);
  });

  it("처음 지울 때는 만든 때를 묻지 않는다", async () => {
    await softDeleteCharacter(me, "c-live");
    expect(st.softRefs[0]!.createdBefore).toBeUndefined();
  });
});

describe("회원이 지운 캐릭터는", () => {
  it("내 목록에 없다", async () => {
    expect((await listCharacters(me)).map((entry) => entry.id)).toEqual(["c-live"]);
  });

  it("id 로 열어도 없다", async () => {
    expect(await listCharacters(me, null, { ids: ["c-gone"] })).toEqual([]);
  });

  it("관리자 전체 보기에도 없다 — 관리자는 「회원이 삭제한 자료」에서 본다", async () => {
    expect((await listCharacters("", null, { allMembers: true })).map((entry) => entry.id).sort()).toEqual(["c-live", "c-other"]);
  });

  it("관리자 「회원이 삭제한 자료」에는 지운 때와 함께 나온다", async () => {
    const found = await listCharacters("", null, { allMembers: true, deleted: true });
    expect(found.map((entry) => [entry.id, entry.deletedAt])).toEqual([["c-gone", GONE]]);
    expect(found[0]!.views[0]!.url).toBe(`signed:${me}/c-gone/front.png`);
  });

  it("생성 재료로 안 꺼낸다", async () => {
    expect(await loadCharacterView(me, "c-gone", "front")).toBeNull();
    expect(await loadCharacterView(me, "c-live", "front")).not.toBeNull();
  });
});

describe("관리자의 완전 삭제", () => {
  it("회원이 지운 캐릭터도 줄·파일까지 지운다", async () => {
    expect(await deleteCharacter(me, "c-gone")).toEqual({ ok: true });
    expect(st.tables.characters!.map((entry) => entry.id)).toEqual(["c-live", "c-other"]);
    expect(st.removedFiles.flat()).toContain(`${me}/c-gone/front.png`);
  });

  it("라이브러리 사본은 **그 캐릭터와 함께 보관된 것만** 지운다(지운 때가 같은 것)", async () => {
    await deleteCharacter(me, "c-gone");
    expect(st.hardRefs.length).toBeGreaterThan(0);
    expect(st.hardRefs.every((entry) => entry.deletedAt === GONE && entry.title.startsWith("지운 (캐릭터)"))).toBe(true);
  });

  it("살아 있는 캐릭터의 사본은 살아 있는 것만 지운다", async () => {
    await deleteCharacter(me, "c-live");
    expect(st.hardRefs.every((entry) => entry.deletedAt === null)).toBe(true);
  });
});
