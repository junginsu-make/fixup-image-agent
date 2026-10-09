import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 쉽게 대화를 지우면 보관한다**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 대화 줄·대화 내용은 남고 지운 때·지운 사람만 적힌다. 회원 화면(레일·대화 열기·라이브러리 「과정 보기」)에서는
 * RLS 가 감추고(202610090002), 관리자가 「회원이 삭제한 자료」에서 확인한다. 6개월 뒤 자동 파기.
 *
 * 회원은 지운 때 칸을 쓸 권한이 없어(RESTRICTIVE 정책의 with check) 서버 권한으로 쓰되, 주인·살아 있는 것만
 * 고르고 고친 줄을 센다 — 0줄을 성공으로 읽으면 「지웠습니다」 뒤에 그대로 남는다(2026-09-15 사고).
 */
type Row = { id: string; user_id: string; deleted_at: string | null; deleted_by?: string | null };

const st = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; user_id: string; deleted_at: string | null; deleted_by?: string | null }>,
  sessionDeletes: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false, getLocalDatabase: () => ({}) }));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const name of ["select", "eq", "is"]) builder[name] = () => builder;
      builder.delete = () => { st.sessionDeletes += 1; return builder; };
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    },
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Partial<Row> = {};
      const builder: Record<string, unknown> = {
        update: (values: Partial<Row>) => { patch = values; return builder; },
        eq: (column: keyof Row, value: string) => { filters.push((row) => row[column] === value); return builder; },
        is: (column: keyof Row, value: null) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
        select: () => builder,
        then: (resolve: (value: unknown) => unknown) => {
          const hit = st.rows.filter((row) => filters.every((match) => match(row)));
          st.rows = st.rows.map((row) => (hit.includes(row) ? { ...row, ...patch } : row));
          return Promise.resolve({ data: hit.map((row) => ({ id: row.id })), error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));

const { easyStoreForUser } = await import("../store");

beforeEach(() => {
  st.rows = [
    { id: "mine", user_id: "me", deleted_at: null },
    { id: "theirs", user_id: "other", deleted_at: null },
    { id: "gone", user_id: "me", deleted_at: "2026-10-01T00:00:00.000Z" },
  ];
  st.sessionDeletes = 0;
});

describe("쉽게 대화 지우기", () => {
  it("대화 줄은 남고 지운 때·지운 사람만 적힌다", async () => {
    expect(await easyStoreForUser("me").removeConversation("mine")).toBe(true);
    expect(st.rows[0]).toMatchObject({ id: "mine", deleted_by: "me" });
    expect(st.rows[0]!.deleted_at).toEqual(expect.any(String));
    expect(st.sessionDeletes).toBe(0);
  });

  it("남의 것·이미 지운 것은 못 지운다 — false", async () => {
    expect(await easyStoreForUser("me").removeConversation("theirs")).toBe(false);
    expect(await easyStoreForUser("me").removeConversation("gone")).toBe(false);
    expect(st.rows[1]!.deleted_at).toBeNull();
    expect(st.rows[2]!.deleted_at).toBe("2026-10-01T00:00:00.000Z");
  });
});
