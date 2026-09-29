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

type Row = { id: string; user_id: string; storage_path: string; thumb_path: string | null };

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  rows: [] as Array<{ id: string; user_id: string; storage_path: string; thumb_path: string | null }>,
  /** 세션 클라이언트가 보이는 줄 — RLS 처럼 요청한 사람 것만. */
  sessionUser: "",
  deletedBy: [] as Array<{ client: "session" | "admin"; id: string }>,
  removedFiles: [] as string[],
}));

function client(kind: "session" | "admin") {
  return {
    from: () => {
      let id = "";
      let deleting = false;
      const builder = {
        select: () => builder,
        delete: () => { deleting = true; return builder; },
        eq: (_column: string, value: string) => {
          id = value;
          if (deleting) {
            state.deletedBy.push({ client: kind, id });
            state.rows = state.rows.filter((row) => !(row.id === id && (kind === "admin" || row.user_id === state.sessionUser)));
            return Promise.resolve({ error: null });
          }
          return builder;
        },
        maybeSingle: async () => {
          // Postgres 는 uuid 모양이 아닌 값을 비교하지 못하고 22P02 로 거절한다.
          if (!/^[0-9a-f-]{36}$/.test(id) && !state.rows.some((entry) => entry.id === id)) {
            return { data: null, error: { code: "22P02", message: `invalid input syntax for type uuid: "${id}"` } };
          }
          const row = state.rows.find((entry) => entry.id === id);
          const visible = row && (kind === "admin" || row.user_id === state.sessionUser);
          return { data: visible ? row : null, error: null };
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
});

describe("참고 이미지 지우기", () => {
  it("올린 사람은 자기 것을 지운다", async () => {
    로그인("member-1", "member");
    const response = await 지운다(MINE);
    expect(response.status).toBe(200);
    expect(state.rows.map((row) => row.id)).toEqual([THEIRS]);
    expect(state.removedFiles).toContain(`member-1/references/${MINE}.png`);
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
});
