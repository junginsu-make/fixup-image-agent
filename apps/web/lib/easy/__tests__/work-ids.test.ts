import { describe, expect, it } from "vitest";
import { EASY_WORK_PAGE, collectEasyWorkIds } from "../store-core";

/**
 * **쉽게로 만든 작업 id 모으기** (2026-09-22 라이브러리 필터).
 *
 * 한 번에 받으면 1000줄에서 잘려 옛 쉽게 작업이 「다양하게」로 넘어간다.
 */
const rows = (count: number, prefix: string) =>
  Array.from({ length: count }, (_, index) => ({ work_id: `${prefix}${index}` }));

describe("쉽게 작업 id", () => {
  it("한 쪽을 꽉 채우면 다음 쪽도 받는다", async () => {
    const asked: Array<[number, number]> = [];
    const pages = [rows(EASY_WORK_PAGE, "a"), rows(3, "b")];
    const ids = await collectEasyWorkIds(async (from, to) => {
      asked.push([from, to]);
      return { data: pages.shift() ?? [], error: null };
    });
    expect(asked).toEqual([[0, EASY_WORK_PAGE - 1], [EASY_WORK_PAGE, EASY_WORK_PAGE * 2 - 1]]);
    expect(ids).toHaveLength(EASY_WORK_PAGE + 3);
  });

  it("빈 칸과 겹치는 id 는 한 번만", async () => {
    const ids = await collectEasyWorkIds(async () => ({
      data: [{ work_id: "p1" }, { work_id: null }, { work_id: "p1" }, { work_id: "p2" }],
      error: null,
    }));
    expect(ids).toEqual(["p1", "p2"]);
  });

  /** 못 읽었는데 빈 목록을 주면 쉽게 작업이 전부 「다양하게」로 보인다. */
  it("못 읽으면 빈 목록이 아니라 실패다", async () => {
    await expect(collectEasyWorkIds(async () => ({ data: null, error: { message: "boom" } })))
      .rejects.toThrow("boom");
  });
});
