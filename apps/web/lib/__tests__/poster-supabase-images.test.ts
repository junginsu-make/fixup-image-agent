import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 운영 저장소의 결과 목록 — 만든 차례, 고친 이력, 그리고 **이력을 못 읽어도
 * 목록은 나온다.**
 *
 * 이력은 이름표일 뿐이다. 요청 장부는 자기 것만 읽히므로(RLS) 팀원이 보는 작업은
 * 빈 이력이 오고, 장부 조회가 실패할 수도 있다. 그때 던지면 그림이 통째로 안
 * 보인다.
 */

vi.mock("server-only", () => ({}));

type Result = { data: unknown[] | null; error: { message: string } | null };
let imagesResult: Result;
let editsResult: Result;
const notCalls: unknown[][] = [];
/** 어느 표를 물었나. */
const tables: string[] = [];

function query(result: () => Result) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    not: (...args: unknown[]) => { notCalls.push(args); return chain; },
    then: (resolve: (value: Result) => unknown) => resolve(result()),
  };
  return chain;
}

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      tables.push(table);
      return query(() => (table === "poster_images" ? imagesResult : editsResult));
    },
  }),
}));
vi.mock("../supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("../teams/scope", () => ({ scopedRead: () => ({}) }));
vi.mock("../teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../teams/current-project", () => ({ selectedProjectFor: async () => null }));

const { createSupabasePosterImageStore } = await import("../poster/supabase-store");

const imageRow = (id: string, requestId: string, variantIndex: number, createdAt: string) => ({
  id, user_id: "u1", project_id: "p1", generation_request_id: requestId, variant_index: variantIndex,
  selected: false, asset_path: `u1/poster/p1/${requestId}/${variantIndex}.png`, thumb_path: null,
  width: 1024, height: 1536, review: null, created_at: createdAt,
});

beforeEach(() => {
  notCalls.length = 0;
  tables.length = 0;
  // DB 가 변형 번호로만 줄 세운 그대로 — 고친 결과(e1)가 「변형 1」 옆에 낀다.
  imagesResult = {
    data: [
      imageRow("v1", "req-1", 0, "2026-09-29T08:00:00.123+00:00"),
      imageRow("e1", "req-2", 0, "2026-09-29T08:05:00+00:00"),
      imageRow("v2", "req-1", 1, "2026-09-29T08:00:00.123+00:00"),
      imageRow("v3", "req-1", 2, "2026-09-29T08:00:00.123+00:00"),
    ],
    error: null,
  };
  editsResult = {
    data: [{ id: "req-2", parent_image_id: "v3", edit_instruction: "배경을 밤으로 바꿔 주세요" }],
    error: null,
  };
});

describe("운영 결과 목록", () => {
  it("만든 차례로 주고, 고친 결과에 이력을 붙인다", async () => {
    const list = await createSupabasePosterImageStore("u1").byProject("p1");
    expect(list.map((image) => image.id)).toEqual(["v1", "v2", "v3", "e1"]);
    expect(list.at(-1)!.edit).toEqual({ parentImageId: "v3", instruction: "배경을 밤으로 바꿔 주세요" });
    expect(list[0]!.edit).toBeNull();
  });

  it("고치기 요청만 묻는다 — 지시가 없는 줄은 거른다", async () => {
    await createSupabasePosterImageStore("u1").byProject("p1");
    expect(notCalls).toContainEqual(["edit_instruction", "is", null]);
  });

  it("이력을 못 읽어도 그림은 다 나온다", async () => {
    editsResult = { data: null, error: { message: "permission denied" } };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const list = await createSupabasePosterImageStore("u1").byProject("p1");
    expect(list.map((image) => image.id)).toEqual(["v1", "v2", "v3", "e1"]);
    expect(list.every((image) => image.edit === null)).toBe(true);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("이력을 안 읽기로 하면 장부를 아예 묻지 않는다 — 파일 한 장 줄 때마다 질의가 늘지 않게", async () => {
    const list = await createSupabasePosterImageStore("u1").byProject("p1", { lineage: false });
    expect(tables).toEqual(["poster_images"]);
    // 차례는 그대로 만든 차례다.
    expect(list.map((image) => image.id)).toEqual(["v1", "v2", "v3", "e1"]);
  });

  it("그림 목록 자체를 못 읽으면 지금처럼 알린다", async () => {
    imagesResult = { data: null, error: { message: "boom" } };
    await expect(createSupabasePosterImageStore("u1").byProject("p1")).rejects.toThrow(/포스터 이미지 목록/);
  });
});
