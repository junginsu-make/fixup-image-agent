import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **남의 것까지 세면 모두가 막힌다**(C-7).
 *
 * 누적 상한을 넣으면서 「지금 몇 장인가」를 세는 함수를 만들었다. 이 함수가
 * **`user_id` 조건을 빠뜨리면 전체를 센다** — 저장소에 200장이 쌓이는 순간
 * 모든 사용자가 「200장까지 보관할 수 있습니다」를 만난다. 아무도 못 올리고,
 * 원인은 눈에 안 띈다.
 *
 * 라우트 시험은 이 함수를 흉내로 바꿔치기하므로 **진짜 구현을 한 번도 안
 * 돌린다**(2026-09-21 변이에서 드러남). 여기서 잰다.
 */

vi.mock("server-only", () => ({}));

const 부른것: Array<{ table: string; op: string; value?: unknown }> = [];
let 셈결과: { count: number | null; error: { message: string } | null } = { count: 7, error: null };

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      부른것.push({ table, op: "from" });
      const builder = {
        select: (columns: string, options?: Record<string, unknown>) => {
          부른것.push({ table, op: "select", value: { columns, ...options } });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          부른것.push({ table, op: "eq", value: { column, value } });
          return Promise.resolve(셈결과) as never;
        },
      };
      return builder;
    },
  }),
}));

const { countUserStyleReferences } = await import("../user-style-references");

beforeEach(() => {
  부른것.length = 0;
  셈결과 = { count: 7, error: null };
});

describe("쌓인 수를 센다", () => {
  it("**표가 준 수를 그대로 돌려준다**", async () => {
    expect(await countUserStyleReferences("u1")).toBe(7);
  });

  /**
   * **이 사람 것만 센다.** 조건을 빠뜨리면 전체를 세어 모두가 막힌다.
   */
  it("**자기 것만 센다**", async () => {
    await countUserStyleReferences("u1");

    expect(부른것).toContainEqual({
      table: "style_references",
      op: "eq",
      value: { column: "user_id", value: "u1" },
    });
  });

  it("**레퍼런스 표를 본다**", async () => {
    await countUserStyleReferences("u1");

    expect(부른것[0]).toEqual({ table: "style_references", op: "from" });
  });

  /**
   * **줄을 읽지 않고 수만 묻는다.** 200장을 통째로 받아 오면 올릴 때마다
   * 그 무게를 치른다.
   */
  it("**머리만 받아 온다**", async () => {
    await countUserStyleReferences("u1");

    const 고른것 = 부른것.find((call) => call.op === "select");
    expect(고른것?.value).toMatchObject({ count: "exact", head: true });
  });

  it("**한 장도 없으면 0 이다**", async () => {
    셈결과 = { count: null, error: null };

    expect(await countUserStyleReferences("u1")).toBe(0);
  });

  /**
   * **못 세면 0 이라고 하지 않는다.** 0 으로 답하면 「한도 안」으로 읽혀
   * 상한이 조용히 사라진다. 부르는 쪽이 「못 셌다」를 알아야 한다.
   */
  it("**표가 실패하면 던진다**", async () => {
    셈결과 = { count: null, error: { message: "표를 못 읽었습니다" } };

    await expect(countUserStyleReferences("u1")).rejects.toThrow("표를 못 읽었습니다");
  });
});
