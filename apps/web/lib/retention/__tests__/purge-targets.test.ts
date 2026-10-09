import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **6개월 자동 파기가 무엇을, 어떻게 지우나**(2026-10-08 — 계획 3단계).
 *
 * - 갈래마다 **회원이 지운 것 가운데 6개월 지난 것만** 묻는다(`deleted_at < 기준`). 살아 있는 것은 절대 안 걸린다
 * - 지우기는 관리자 완전 삭제와 **같은 함수**를 부른다 — 사본·각도·옛 라이브러리 그림 규칙이 갈리지 않게
 * - 상세페이지는 이미 비운 문서(내용 없음)를 다시 묻지 않는다
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  queries: [] as Array<{ table: string; ops: string[] }>,
  calls: [] as unknown[][],
  libraryResult: { ok: true } as { ok: boolean; message?: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      const ops: string[] = [];
      st.queries.push({ table, ops });
      let cap = Infinity;
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: (column: string) => { ops.push(`order:${column}`); return builder; },
        limit: (count: number) => { cap = count; ops.push(`limit:${count}`); return builder; },
        lt: (column: string, value: string) => {
          ops.push(`lt:${column}`);
          filters.push((row) => row[column] !== null && row[column] !== undefined && String(row[column]) < value);
          return builder;
        },
        not: (column: string, op: string, value: string | null) => {
          if (op === "in") {
            ops.push(`not-in:${column}`);
            const ids = String(value).slice(1, -1).split(",");
            filters.push((row) => !ids.includes(String(row[column])));
            return builder;
          }
          ops.push(`not-null:${column}`);
          filters.push((row) => (row[column] ?? null) !== value);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({
          data: (st.tables[table] ?? []).filter((row) => filters.every((match) => match(row))).slice(0, cap),
          error: null,
        }).then(resolve),
      };
      return builder;
    },
  }),
}));
vi.mock("../../../app/api/admin/works/store", () => ({
  deleteAnyWork: async (...args: unknown[]) => { st.calls.push(["work", ...args]); return true; },
}));
vi.mock("../../server-library", () => ({
  deleteLibraryItem: async (...args: unknown[]) => { st.calls.push(["library", ...args]); return st.libraryResult; },
}));
vi.mock("../../characters", () => ({
  deleteCharacter: async (...args: unknown[]) => { st.calls.push(["character", ...args]); return { ok: true }; },
}));
vi.mock("../../reference-soft-delete", () => ({
  purgeReferenceImage: async (...args: unknown[]) => { st.calls.push(["reference", ...args]); },
}));
vi.mock("../../easy/deleted-conversations", () => ({
  purgeDeletedConversation: async (...args: unknown[]) => { st.calls.push(["easy", ...args]); return true; },
}));
vi.mock("../../pdp/documents", () => ({
  documentServices: () => ({ repo: "repo", storage: "storage" }),
}));
vi.mock("../../pdp/documents/http", () => ({
  completeDocumentDelete: async (deps: { repo: unknown; storage: unknown; cleanupLegacy?: unknown }, ...args: unknown[]) => {
    st.calls.push(["pdp", deps.repo, deps.storage, typeof deps.cleanupLegacy, ...args]);
  },
}));
vi.mock("../../pdp/documents/delete-legacy", () => ({ deleteDocumentLegacy: async () => undefined }));

const { purgeTargets } = await import("../purge-targets");

const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-09-30T00:00:00.000Z";
const CUTOFF = "2026-04-09T00:00:00.000Z";

beforeEach(() => {
  st.queries = [];
  st.calls = [];
  st.libraryResult = { ok: true };
  const rows = (prefix: string) => [
    { id: `${prefix}-old`, user_id: "u1", deleted_at: OLD },
    { id: `${prefix}-recent`, user_id: "u1", deleted_at: RECENT },
    { id: `${prefix}-live`, user_id: "u1", deleted_at: null },
  ];
  st.tables = {
    sns_projects: rows("sns"),
    poster_projects: rows("poster"),
    library_items: rows("lib"),
    characters: rows("char"),
    reference_images: rows("ref").map((row) => ({ ...row, storage_path: `u1/references/${row.id}.png`, thumb_path: null })),
    easy_conversations: rows("easy"),
    pdp_documents: [
      ...rows("doc").map((row) => ({ ...row, source_draft_id: "draft", document: {} })),
      { id: "doc-emptied", user_id: "u1", deleted_at: OLD, source_draft_id: null, document: null },
    ],
  };
});

const listAll = async () => Object.fromEntries(await Promise.all(
  purgeTargets().map(async (target) => [target.kind, (await target.list(CUTOFF, 50, [])).map((item) => item.id)]),
));

describe("무엇을 지우나", () => {
  it("갈래마다 6개월 지난 것만 — 최근에 지운 것·살아 있는 것은 안 걸린다", async () => {
    expect(await listAll()).toEqual({
      sns: ["sns-old"], poster: ["poster-old"], library: ["lib-old"], pdp: ["doc-old"],
      characters: ["char-old"], references: ["ref-old"], easy: ["easy-old"],
    });
  });

  it("정해진 수까지만 묻는다", async () => {
    await purgeTargets()[0]!.list(CUTOFF, 7, []);
    expect(st.queries[0]!.ops).toContain("limit:7");
  });

  it("이번 회차에 실패한 것은 빼고 묻는다", async () => {
    st.tables.sns_projects = [...st.tables.sns_projects!, { id: "sns-old2", user_id: "u1", deleted_at: OLD }];
    const listed = await purgeTargets()[0]!.list(CUTOFF, 50, ["sns-old"]);
    expect(listed.map((item) => item.id)).toEqual(["sns-old2"]);
  });
});

describe("어떻게 지우나 — 관리자 완전 삭제와 같은 함수", () => {
  const purgeOne = async (kind: string) => {
    const target = purgeTargets().find((entry) => entry.kind === kind)!;
    const [item] = await target.list(CUTOFF, 50, []);
    await target.purge(item!);
  };

  it("카드뉴스·포스터", async () => {
    await purgeOne("sns");
    await purgeOne("poster");
    expect(st.calls).toEqual([["work", "sns", "sns-old"], ["work", "poster", "poster-old"]]);
  });

  it("라이브러리는 관리자처럼(주인 조건 없이) 지우고, 못 지우면 실패로 센다", async () => {
    await purgeOne("library");
    expect(st.calls[0]).toEqual(["library", expect.objectContaining({ role: "admin" }), "lib-old"]);
    st.libraryResult = { ok: false, message: "그림 목록을 읽지 못해 지우지 않았습니다" };
    await expect(purgeOne("library")).rejects.toThrow();
  });

  it("상세페이지는 옛 라이브러리 그림·문서 파일까지 비운다", async () => {
    await purgeOne("pdp");
    expect(st.calls).toEqual([["pdp", "repo", "storage", "function", "u1", { id: "doc-old", sourceDraftId: "draft" }]]);
  });

  it("캐릭터는 주인으로, 참고 이미지는 파일 위치와 함께, 대화는 id 로", async () => {
    await purgeOne("characters");
    await purgeOne("references");
    await purgeOne("easy");
    expect(st.calls).toEqual([
      ["character", "u1", "char-old"],
      ["reference", { id: "ref-old", owner: "u1", storagePath: "u1/references/ref-old.png", thumbPath: null }],
      ["easy", "easy-old"],
    ]);
  });
});
