import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **참고 이미지 지우기 — 누가 무엇을 지우나**(2026-09-28).
 *
 * 참고 이미지가 「올린 사람만」 보이게 되면서(202609280004) 세션 클라이언트로
 * 행을 찾으면 관리자에게도 남의 행이 안 보인다. 그대로 두면 관리자가 잘못
 * 올라온 것을 치우려 해도 「찾을 수 없습니다」가 뜬다(2026-09-28 독립 리뷰).
 *
 * 그래서 행은 서버 권한으로 찾고, 지울 수 있는지는 `canModifyReferenceImage` 가
 * 정한다. 못 지우는 사람에게는 **없는 것처럼** 답한다 — 남의 것이 있는지조차
 * 알려 주지 않는다.
 */

vi.mock("server-only", () => ({}));

type Row = {
  id: string; user_id: string; storage_path: string; thumb_path: string | null;
  deleted_at?: string | null; deleted_by?: string | null;
};

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  rows: [] as Array<{
    id: string; user_id: string; storage_path: string; thumb_path: string | null;
    deleted_at?: string | null; deleted_by?: string | null;
  }>,
  /** 세션 클라이언트가 보이는 줄 — RLS 처럼 요청한 사람 것만. */
  sessionUser: "",
  deletedBy: [] as Array<{ client: "session" | "admin"; id: string }>,
  /** 서버 권한 조회가 DB 오류로 끝나는 경우(마이그레이션 전 서버 등). */
  failRead: false,
  removedFiles: [] as string[],
}));

function client(kind: "session" | "admin") {
  return {
    from: () => {
      const filters: Array<(row: Row) => boolean> = [];
      let id = "";
      let action: "read" | "delete" | "update" = "read";
      let patch: Partial<Row> = {};
      // 세션은 RLS 처럼 자기 것·살아 있는 것만 본다.
      const visible = (row: Row) => (kind === "admin" || (row.user_id === state.sessionUser && !row.deleted_at))
        && filters.every((match) => match(row));
      const run = () => {
        const hit = state.rows.filter(visible);
        if (action === "delete") {
          state.deletedBy.push({ client: kind, id });
          state.rows = state.rows.filter((row) => !hit.includes(row));
        }
        if (action === "update") {
          state.rows = state.rows.map((row) => (hit.includes(row) ? { ...row, ...patch } : row));
        }
        return { data: hit.map((row) => ({ id: row.id })), error: null };
      };
      const builder = {
        select: () => builder,
        delete: () => { action = "delete"; return builder; },
        update: (values: Partial<Row>) => { action = "update"; patch = values; return builder; },
        eq: (column: keyof Row, value: string) => {
          if (column === "id") id = value;
          filters.push((row) => row[column] === value);
          return builder;
        },
        is: (column: keyof Row, value: null) => {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
        maybeSingle: async () => {
          if (state.failRead) return { data: null, error: { message: "column reference_images.deleted_at does not exist" } };
          // Postgres 는 uuid 모양이 아닌 값을 비교하지 못하고 22P02 로 거절한다.
          if (!/^[0-9a-f-]{36}$/.test(id) && !state.rows.some((entry) => entry.id === id)) {
            return { data: null, error: { code: "22P02", message: `invalid input syntax for type uuid: "${id}"` } };
          }
          return { data: state.rows.find(visible) ?? null, error: null };
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => { state.removedFiles.push(...paths); return { error: null }; },
      }),
    },
  };
}

vi.mock("../../../../../lib/membership/api", () => ({ authenticateApiMember: state.auth }));
vi.mock("../../../../../lib/local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../../../../lib/supabase/server", () => ({ createSupabaseServerClient: async () => client("session") }));
vi.mock("../../../../../lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client("admin") }));

const { DELETE } = await import("../route");

const MINE = "11111111-1111-4111-8111-111111111111";
const THEIRS = "22222222-2222-4222-8222-222222222222";
const NOTHING = "33333333-3333-4333-8333-333333333333";

const 줄 = (id: string, user_id: string): Row => ({
  id, user_id, storage_path: `${user_id}/references/${id}.png`, thumb_path: null,
});

const 로그인 = (userId: string, role: "member" | "admin") => {
  state.sessionUser = userId;
  state.auth.mockResolvedValue({ ok: true, member: { userId, profile: { role } } });
};

const 지운다 = (id: string) =>
  DELETE(new Request(`http://local/api/reference-images/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  state.rows = [줄(MINE, "member-1"), 줄(THEIRS, "member-9")];
  state.deletedBy = [];
  state.removedFiles = [];
  state.failRead = false;
});

describe("참고 이미지 지우기", () => {
  /**
   * **회원이 지우면 보관한다**(2026-10-08 사용자 결정 — 계획 2단계). 줄·파일은 남고 지운 때·지운 사람만 적힌다.
   * 회원 화면과 만들기 재료에서는 사라지고, 관리자가 「회원이 삭제한 자료」에서 확인한다(6개월 뒤 파기).
   */
  it("올린 사람이 지우면 줄·파일은 남고 지운 때만 적힌다", async () => {
    로그인("member-1", "member");
    const response = await 지운다(MINE);
    expect(response.status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual([MINE, THEIRS]);
    expect(state.rows[0]).toMatchObject({ deleted_by: "member-1" });
    expect(state.rows[0]!.deleted_at).toEqual(expect.any(String));
    expect(state.removedFiles).toEqual([]);
    expect(state.deletedBy).toEqual([]);
  });

  it("회원이 이미 지운 것은 다시 못 찾는다", async () => {
    로그인("member-1", "member");
    state.rows = [{ ...줄(MINE, "member-1"), deleted_at: "2026-10-01T00:00:00.000Z" }];
    expect((await 지운다(MINE)).status).toBe(404);
    expect(state.rows[0]!.deleted_at).toBe("2026-10-01T00:00:00.000Z");
  });

  it("관리자는 회원이 지운 것을 파일까지 완전히 지운다", async () => {
    로그인("admin-1", "admin");
    state.rows = [{ ...줄(THEIRS, "member-9"), deleted_at: "2026-10-01T00:00:00.000Z" }];
    expect((await 지운다(THEIRS)).status).toBe(200);
    expect(state.rows).toEqual([]);
    expect(state.removedFiles).toContain(`member-9/references/${THEIRS}.png`);
  });

  it("**관리자는 남이 올린 것도 지운다** — 목록이 「내 것만」이 된 뒤에도", async () => {
    로그인("admin-1", "admin");
    const response = await 지운다(THEIRS);
    expect(response.status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual([MINE]);
    // 남의 행을 세션으로 지우면 RLS 가 0줄로 막고 성공처럼 답한다.
    expect(state.deletedBy).toEqual([{ client: "admin", id: THEIRS }]);
  });

  it("회원은 남의 것을 못 지우고, 있다는 사실도 모른다", async () => {
    로그인("member-1", "member");
    const response = await 지운다(THEIRS);
    expect(response.status).toBe(404);
    expect(state.rows.map((row) => row.id)).toEqual([MINE, THEIRS]);
    expect(state.deletedBy).toEqual([]);
  });

  it("id 모양이 아니면 DB 에 묻지 않고 없다고 답한다 — 500 이 아니다", async () => {
    로그인("admin-1", "admin");
    expect((await 지운다("not-a-uuid")).status).toBe(404);
  });

  it("없는 것은 없다고 답한다", async () => {
    로그인("admin-1", "admin");
    expect((await 지운다(NOTHING)).status).toBe(404);
  });

  /** 표·칸 이름은 화면에 안 보낸다(2026-10-08 보안 리뷰) — 서버 기록에만 남긴다. */
  it("DB 오류 원문은 회원에게 안 나간다", async () => {
    로그인("member-1", "member");
    state.failRead = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await 지운다(MINE);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("deleted_at");
  });

  /** 회원일 때 지웠다가 관리자가 된 계정 등 — 세션으로 지우면 RLS 가 그 줄을 감춰 0줄, 파일만 사라진다(리뷰). */
  it("관리자가 자기의 지운 그림을 지워도 줄까지 지운다", async () => {
    로그인("admin-1", "admin");
    state.rows = [{ ...줄(MINE, "admin-1"), deleted_at: "2026-10-01T00:00:00.000Z" }];
    expect((await 지운다(MINE)).status).toBe(200);
    expect(state.rows).toEqual([]);
  });
});
