import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **관리자의 「회원이 삭제한 자료」 — 쉽게 대화**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 회원이 지운 대화만 보고, 열고, 완전히 지운다. 살아 있는 대화는 이 길로 열리지도 지워지지도 않는다 — 지운 때가
 * 없으면 없는 것이다. 가짜 질의는 걸린 조건으로 실제로 거른다(조건을 빼면 시험이 깨져야 한다).
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>> }));

vi.mock("server-only", () => ({}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../reference-images", () => ({
  emailsByUserId: async (ids: string[]) => new Map(ids.map((id) => [id, `${id}@example.com`])),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      let removing = false;
      const run = () => {
        const hit = (st.tables[table] ?? []).filter((row) => filters.every((match) => match(row)));
        if (removing) st.tables[table] = (st.tables[table] ?? []).filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        order: () => builder,
        limit: () => builder,
        delete: () => { removing = true; return builder; },
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
        not: (column: string, _op: string, value: null) => { filters.push((row) => (row[column] ?? null) !== value); return builder; },
        maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return builder;
    },
  }),
}));

const { listDeletedConversations, readDeletedConversation, purgeDeletedConversation } = await import("../deleted-conversations");

const GONE = "2026-10-08T00:00:00.000Z";
beforeEach(() => {
  st.tables = {
    easy_conversations: [
      { id: "live", user_id: "u1", title: "살아 있는", created_at: "2026-10-01", deleted_at: null },
      { id: "gone", user_id: "u1", title: "지운", created_at: "2026-10-01", deleted_at: GONE },
    ],
    easy_messages: [
      { id: "m1", conversation_id: "gone", role: "user", body: "지운 대화의 말", work_id: null, created_at: "2026-10-01" },
      { id: "m2", conversation_id: "live", role: "user", body: "살아 있는 말", work_id: null, created_at: "2026-10-01" },
    ],
  };
});

describe("회원이 지운 쉽게 대화", () => {
  it("목록에는 지운 대화만, 지운 때·주인 이메일과 함께", async () => {
    expect(await listDeletedConversations()).toEqual([
      { id: "gone", userId: "u1", ownerEmail: "u1@example.com", title: "지운", createdAt: "2026-10-01", deletedAt: GONE },
    ]);
  });

  it("지운 대화의 내용을 연다", async () => {
    expect((await readDeletedConversation("gone"))?.map((message) => message.body)).toEqual(["지운 대화의 말"]);
  });

  it("살아 있는 대화는 이 길로 안 열린다", async () => {
    expect(await readDeletedConversation("live")).toBeNull();
  });

  it("지운 대화만 완전히 지운다 — 살아 있는 대화는 그대로", async () => {
    expect(await purgeDeletedConversation("live")).toBe(false);
    expect(await purgeDeletedConversation("gone")).toBe(true);
    expect(st.tables.easy_conversations!.map((row) => row.id)).toEqual(["live"]);
  });
});
