import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **최고 관리자의 캐릭터 전체 보기**(2026-10-08 사용자 요청) — 데이터 쪽 경계.
 *
 * - 만든 사람의 이메일은 **관리자가 전체를 볼 때, 남의 것에만** 붙는다. 회원끼리 이메일이 보이면 안 된다
 * - 전체 보기는 모든 회원을 합친 목록이라 회원용 상한(100)으로 자르면 옛 캐릭터가 사라진다
 */
vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));

const ROWS = [
  { id: "c-mine", user_id: "admin", name: "내 것", source_prompt: "a", identity_prompt: "a", kind: "person", look: "photoreal", created_at: "2026-10-08" },
  { id: "c-other", user_id: "member", name: "남의 것", source_prompt: "b", identity_prompt: "b", kind: "animal", look: "anime", created_at: "2026-10-07" },
  { id: "c-ghost", user_id: "gone", name: "주인 없는 메일", source_prompt: "c", identity_prompt: "c", kind: "object", look: "3d", created_at: "2026-10-06" },
];
const seen = { limits: [] as number[], profileQueries: 0, viewChunks: [] as number[], signChunks: [] as number[] };
let rows: Array<Record<string, unknown>> = ROWS;

/** 부른 메서드를 다 받아 넘기고, 기다리면 표마다 정한 값을 준다. */
function chain(table: string) {
  const data = table === "characters" ? rows
    : table === "character_views" ? []
      : table === "profiles" ? [{ id: "member", email: "member@example.com" }]
        : [];
  if (table === "profiles") seen.profileQueries += 1;
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "order", "eq", "or", "is", "filter"]) builder[name] = () => builder;
  builder.in = (_column: string, values: unknown[]) => {
    if (table === "character_views") seen.viewChunks.push(values.length);
    return builder;
  };
  builder.limit = (count: number) => { seen.limits.push(count); return builder; };
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error: null }));
  return builder;
}

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => chain(table),
    storage: { from: () => ({ createSignedUrls: async (paths: string[]) => { seen.signChunks.push(paths.length); return { data: [] }; } }) },
  }),
}));

const { listCharacters } = await import("../characters");

beforeEach(() => {
  seen.limits.length = 0;
  seen.profileQueries = 0;
  seen.viewChunks.length = 0;
  seen.signChunks.length = 0;
  rows = ROWS;
});

describe("만든 사람 이메일", () => {
  it("회원 목록에는 어떤 캐릭터에도 이메일 칸이 없다 — 묻지도 않는다", async () => {
    const list = await listCharacters("admin", null);
    expect(list.every((character) => !("ownerEmail" in character))).toBe(true);
    expect(seen.profileQueries).toBe(0);
  });

  it("관리자 전체 보기 — 내 것에는 없고 남의 것에만 붙는다", async () => {
    const list = await listCharacters("admin", null, { allMembers: true });
    const byId = new Map(list.map((character) => [character.id, character]));
    expect("ownerEmail" in byId.get("c-mine")!).toBe(false);
    expect(byId.get("c-other")!.ownerEmail).toBe("member@example.com");
    // 메일을 못 찾으면 비워 둔다. 지어내지 않는다.
    expect(byId.get("c-ghost")!.ownerEmail).toBeNull();
  });
});

describe("목록 크기", () => {
  it("회원 목록은 최근 100개", async () => {
    await listCharacters("admin", null);
    expect(seen.limits).toEqual([100]);
  });

  it("관리자 전체 보기는 모든 회원을 합친 것이라 더 넉넉하다", async () => {
    await listCharacters("admin", null, { allMembers: true });
    expect(seen.limits).toEqual([1000]);
  });
});

/**
 * **각도는 나눠 묻는다**(재리뷰 MEDIUM). `.in(id, …)` 은 주소에 그대로 붙어, 캐릭터 1000개면 약 38KB 다.
 * 게이트웨이 한도를 넘으면 오류가 나는데, 그것을 버리면 모든 카드가 「저장된 각도가 없습니다」로 조용히 바뀐다.
 */
describe("많을 때", () => {
  it("캐릭터 id 를 200개씩 나눠 각도를 묻는다", async () => {
    rows = Array.from({ length: 450 }, (_, index) => ({ ...ROWS[1], id: `c-${index}` }));
    await listCharacters("admin", null, { allMembers: true });
    expect(seen.viewChunks).toEqual([200, 200, 50]);
  });
});
