import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **회원이 지운 그림은 카드뉴스 첨부로 다시 안 나온다**(2026-10-08 코드 리뷰 — 계획 2단계).
 *
 * 카드뉴스 첨부는 참고 이미지 id 가 아니라 **저장 위치**로 적힌다. 예전에는 회원이 그림을 지우면 파일도 지워져
 * 서명이 실패했고, 「쓸 수 없는 첨부」(409)로 막혔다. 이제 파일이 남으므로 위치만 보고 서명하면 지운 그림이 다시
 * 보이고 「다시 만들기」·「그대로 넣기」에 들어간다. 그래서 첨부 위치를 회원이 지운 참고 이미지·라이브러리
 * 결과물과 대조해 걸리면 서명하지 않는다 — 지우던 때와 같은 결과다.
 */
type Row = Record<string, unknown>;
const st = vi.hoisted(() => ({ tables: {} as Record<string, Array<Record<string, unknown>>>, fail: false }));

vi.mock("server-only", () => ({}));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: Array<(row: Row) => boolean> = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
        in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
        not: (column: string, _op: string, value: null) => { filters.push((row) => (row[column] ?? null) !== value); return builder; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(st.fail
          ? { data: null, error: { message: "boom" } }
          : { data: (st.tables[table] ?? []).filter((row) => filters.every((match) => match(row))), error: null }).then(resolve),
      };
      return builder;
    },
  }),
}));

const { retiredAttachmentPaths } = await import("../sns/retired-attachments");

beforeEach(() => {
  st.fail = false;
  st.tables = {
    reference_images: [
      { user_id: "u1", storage_path: "u1/references/live.png", deleted_at: null },
      { user_id: "u1", storage_path: "u1/references/gone.png", deleted_at: "2026-10-08T00:00:00.000Z" },
    ],
    library_images: [
      { user_id: "u1", item_id: "i-live", path: "u1/i-live/0.png" },
      { user_id: "u1", item_id: "i-gone", path: "u1/i-gone/0.png" },
    ],
    library_items: [
      { id: "i-live", deleted_at: null },
      { id: "i-gone", deleted_at: "2026-10-08T00:00:00.000Z" },
    ],
  };
});

describe("지운 그림의 첨부 위치", () => {
  const all = ["u1/references/live.png", "u1/references/gone.png", "u1/i-live/0.png", "u1/i-gone/0.png"];

  it("회원이 지운 참고 이미지와 라이브러리 결과물의 위치만 고른다", async () => {
    expect([...await retiredAttachmentPaths("u1", all)].sort()).toEqual(["u1/i-gone/0.png", "u1/references/gone.png"]);
  });

  it("남의 줄은 안 본다", async () => {
    expect([...await retiredAttachmentPaths("u2", all)]).toEqual([]);
  });

  it("첨부가 없으면 묻지 않는다", async () => {
    st.fail = true;
    expect([...await retiredAttachmentPaths("u1", [])]).toEqual([]);
  });

  /** 확인을 못 하면 쓸 수 없는 첨부로 본다 — 지운 그림을 생성 재료로 보내는 쪽으로 틀리지 않는다. */
  it("확인을 못 하면 모두 쓸 수 없는 것으로 본다", async () => {
    st.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect([...await retiredAttachmentPaths("u1", all)].sort()).toEqual([...all].sort());
  });

  /** `in()` 은 값 안의 따옴표·쉼표를 거르지 않는다(2026-10-07 리뷰) — 그런 위치는 묻지 않고 쓸 수 없는 것으로 본다. */
  it("이상한 글자가 든 위치는 묻지 않고 쓸 수 없는 것으로 본다", async () => {
    expect([...await retiredAttachmentPaths("u1", ['u1/references/a",b.png'])]).toEqual(['u1/references/a",b.png']);
  });
});
