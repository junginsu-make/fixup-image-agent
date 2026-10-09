import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 지워도 남긴다**(2026-10-08 사용자 결정, 계획 `2026-10-08-soft-delete-retention.md`).
 *
 * 웹사이트에서 지우면 회원 화면에서는 사라지고, 데이터와 그림 파일은 남아 관리자가 확인한다(6개월 뒤 자동 파기).
 * 그래서 회원의 지우기는 줄을 지우지 않고 `deleted_at`·`deleted_by` 만 채운다 — 그림 파일도 지우지 않는다.
 * 지운 작업에는 더 쓰지도 않는다(늦게 끝난 생성이 지운 작업을 고치지 않게).
 */
vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../teams/current-project", () => ({ selectedProjectFor: async () => null }));

type Call = { client: "admin" | "session"; table: string; ops: Array<[string, ...unknown[]]> };
const calls: Call[] = [];
const storageRemoves: unknown[] = [];
/** 고친 줄이 없다고 답하게 한다 — 남의 것·이미 지운 것을 지울 때. */
let noRowsChanged = false;
/** DB 가 오류를 낸다 — 원문(표·칸 이름)이 회원 화면에 가지 않는지 본다. */
let writeFails = false;
const ROW = {
  id: "p1", user_id: "u1", candidate_id: null, title: "t", status: "ready", ratio: "1:1", language: "ko",
  model_id: "m", card_count_mode: "auto", card_count: null, tone_note: null,
  data: { flow: { cards: [{ index: 0, assetPath: "u1/sns/p1/0.png" }] } }, created_at: "", updated_at: "",
};

function builder(client: Call["client"], table: string) {
  const call: Call = { client, table, ops: [] };
  calls.push(call);
  const self: Record<string, unknown> = {};
  for (const name of ["select", "update", "delete", "insert", "eq", "is", "in", "order", "limit", "or"]) {
    self[name] = (...args: unknown[]) => { call.ops.push([name, ...args]); return self; };
  }
  self.maybeSingle = async () => ({ data: ROW, error: null });
  self.single = async () => ({ data: ROW, error: null });
  self.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve(writeFails
      ? { data: null, error: { message: 'column library_items.deleted_at does not exist' } }
      : { data: noRowsChanged ? [] : [{ id: "p1" }], error: null }));
  return self;
}
const fakeClient = (kind: Call["client"]) => ({
  from: (table: string) => builder(kind, table),
  storage: { from: () => ({ remove: async (paths: unknown) => { storageRemoves.push(paths); return { error: null }; } }) },
});
vi.mock("../supabase/admin", () => ({ createSupabaseAdminClient: () => fakeClient("admin") }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: async () => fakeClient("session") }));

const { snsFlowStoreForUser } = await import("../sns-flow-store");
const { createSupabasePosterProjectStore } = await import("../poster/supabase-store");

beforeEach(() => {
  calls.length = 0;
  storageRemoves.length = 0;
  noRowsChanged = false;
  writeFails = false;
});

const writesTo = (table: string) => calls.filter((call) => call.table === table && call.ops.some(([op]) => op === "update" || op === "delete"));
const opOf = (call: Call, name: string) => call.ops.find(([op]) => op === name);

describe("카드뉴스 지우기", () => {
  it("줄을 지우지 않고 지운 때·지운 사람만 적는다 — 서버 권한으로, 소유자·살아 있는 것만", async () => {
    await (await snsFlowStoreForUser("u1")).remove("p1");
    const [write] = writesTo("sns_projects");
    expect(write!.client).toBe("admin");
    expect(opOf(write!, "delete")).toBeUndefined();
    const patch = opOf(write!, "update")![1] as Record<string, unknown>;
    expect(typeof patch.deleted_at).toBe("string");
    expect(patch.deleted_by).toBe("u1");
    expect(write!.ops).toContainEqual(["eq", "id", "p1"]);
    expect(write!.ops).toContainEqual(["eq", "user_id", "u1"]);
    expect(write!.ops).toContainEqual(["is", "deleted_at", null]);
  });

  it("그림 파일은 지우지 않는다", async () => {
    await (await snsFlowStoreForUser("u1")).remove("p1");
    expect(storageRemoves).toEqual([]);
  });

  it("지운 작업에는 저장하지 않는다", async () => {
    await (await snsFlowStoreForUser("u1")).save("p1", { cards: [] } as never, "ready" as never);
    const [write] = writesTo("sns_projects");
    expect(write!.ops).toContainEqual(["is", "deleted_at", null]);
  });
});

describe("포스터(쉽게·다양하게) 지우기", () => {
  it("줄을 지우지 않고 지운 때·지운 사람만 적는다 — 서버 권한으로, 소유자·살아 있는 것만", async () => {
    expect(await createSupabasePosterProjectStore("u1").remove("p1")).toBe(true);
    const [write] = writesTo("poster_projects");
    expect(write!.client).toBe("admin");
    expect(opOf(write!, "delete")).toBeUndefined();
    const patch = opOf(write!, "update")![1] as Record<string, unknown>;
    expect(typeof patch.deleted_at).toBe("string");
    expect(patch.deleted_by).toBe("u1");
    expect(write!.ops).toContainEqual(["eq", "user_id", "u1"]);
    expect(write!.ops).toContainEqual(["is", "deleted_at", null]);
  });

  it("지운 작업에는 고쳐 쓰지 않는다", async () => {
    await createSupabasePosterProjectStore("u1").update("p1", { status: "done" } as never).catch(() => undefined);
    const [write] = writesTo("poster_projects");
    expect(write!.ops).toContainEqual(["is", "deleted_at", null]);
  });
});

vi.mock("../pdp/documents/flags", () => ({ serverDocumentsEnabled: () => false }));
const library = await import("../server-library");
const member = { userId: "u1", role: "member" as const };
const admin = { userId: "admin-1", role: "admin" as const };

/**
 * **라이브러리(상세페이지 옛 저장분·리디자인·광고소재).** 서버 권한으로 읽으므로 RLS 가 감추지 않는다 —
 * 회원이 읽는 길마다 지운 것을 빼야 한다. 관리자는 지운 것도 「지운 때」와 함께 본다.
 */
describe("라이브러리 지우기", () => {
  it("회원 — 줄을 지우지 않고 지운 때만 적는다, 파일도 남긴다", async () => {
    const result = await library.deleteLibraryItem(member, "p1");
    expect(result.ok).toBe(true);
    const [write] = writesTo("library_items");
    expect(opOf(write!, "delete")).toBeUndefined();
    expect((opOf(write!, "update")![1] as Record<string, unknown>).deleted_by).toBe("u1");
    expect(write!.ops).toContainEqual(["eq", "user_id", "u1"]);
    expect(write!.ops).toContainEqual(["is", "deleted_at", null]);
    expect(storageRemoves).toEqual([]);
  });

  it("회원 — 고친 줄이 없으면(남의 것·이미 지운 것) 지웠다고 하지 않는다", async () => {
    noRowsChanged = true;
    const result = await library.deleteLibraryItem(member, "p1");
    expect(result.ok).toBe(false);
    expect("denied" in result && result.denied).toBe(true);
  });

  it("회원 — DB 오류 원문은 화면에 보내지 않는다", async () => {
    writeFails = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await library.deleteLibraryItem(member, "p1");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toBe("작업물을 지우지 못했습니다.");
  });

  /** 관리자의 지우기는 완전 삭제다(계획 — 관리자는 보기 + 완전 삭제). */
  it("관리자 — 지금처럼 완전히 지운다", async () => {
    await library.deleteLibraryItem(admin, "p1");
    const [write] = writesTo("library_items");
    expect(opOf(write!, "delete")).toBeDefined();
  });
});

describe("라이브러리 읽기", () => {
  const reads = (table: string) => calls.filter((call) => call.table === table && call.ops.some(([op]) => op === "select"));

  it("회원 목록은 지운 것을 뺀다", async () => {
    await library.listLibraryItems(member);
    expect(reads("library_items")[0]!.ops).toContainEqual(["is", "deleted_at", null]);
  });

  it("관리자 목록은 지운 것도 싣는다", async () => {
    await library.listLibraryItems(admin);
    expect(reads("library_items")[0]!.ops).not.toContainEqual(["is", "deleted_at", null]);
  });

  it("이어 붙일 작업을 찾을 때 지운 작업은 고르지 않는다 — 새로 만든다", async () => {
    await library.findLibraryItemBySource("u1", "create", "src-1");
    expect(reads("library_items")[0]!.ops).toContainEqual(["is", "deleted_at", null]);
  });

  it("회원이 한 건을 열 때도 지운 것은 없는 것이다", async () => {
    await library.getLibraryItem(member, "p1");
    expect(reads("library_items")[0]!.ops).toContainEqual(["is", "deleted_at", null]);
  });
});
