import { describe, expect, it } from "vitest";
import { DELETED_WORK, markDeletedWork } from "../deleted-work";

/**
 * **지운 작업의 줄**(미뤄 둔 것 2). 카드뉴스 목록이나 라이브러리에서 작업을 지우면 그 줄은
 * 그림도 원고도 없이 「만드는 중」으로 영영 돌았다. 다시 열 때 안내 한 줄로 바꾼다.
 */
describe("지운 작업", () => {
  const 줄 = [
    { id: "u", role: "user" as const, body: "만들어줘" },
    { id: "a", role: "image" as const, body: "", workId: "poster-1" },
    { id: "b", role: "image" as const, body: "", workId: "gone" },
    { id: "c", role: "image" as const, body: "" },
  ];

  it("포스터에도 카드뉴스에도 없는 작업의 줄은 안내 줄이 된다", () => {
    expect(markDeletedWork(줄, new Set(["poster-1"]))).toEqual([
      줄[0], 줄[1], { id: "b", role: "assistant", body: DELETED_WORK }, 줄[3],
    ]);
  });

  it("작업 id 가 없는 줄(막 만들기 시작한 자리)은 그대로", () => {
    expect(markDeletedWork([줄[3]!], new Set())).toEqual([줄[3]]);
  });
});
