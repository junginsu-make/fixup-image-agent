import { describe, expect, it } from "vitest";
import {
  describeEasyResults, doneImageNumbers, nextResultNumber, numberEasyResults, resultKindOf, resultLabel,
} from "../image-numbers";
import { editRowBody, withRowFrom, withRowJob } from "../row-image";
import { askBody, sayBody, withPick } from "../row-marks";

/**
 * **이 대화의 결과물 번호**(2026-10-07 2차 설계 D2 · §3-2, 2차 최종 리뷰 5). 화면과 서버가 같은 함수를 쓴다.
 * 이미지 · 카드뉴스 · 지운 것 모두 대화 차례대로 센다 — 표시를 안 보므로 운영의 옛 줄도 번호가 안 바뀌고,
 * 무엇을 지워도 뒤 번호가 당겨지지 않는다(「아까 1번」이 늘 같은 것을 가리킨다).
 */
const 일감 = { requestRowId: "r", falRequestId: "f", endpoint: "e" };
const 말 = (id: string, body: string) => ({ id, role: "user", body, workId: null });
const 결과 = (id: string, workId: string, body = withRowJob("", 일감)) => ({ id, role: "image", body, workId });

describe("결과물 번호", () => {
  it("이미지 · 카드뉴스 줄 모두 대화 차례대로 1, 2, … — 말 줄 · 작업 없는 줄은 안 센다", () => {
    const rows = [
      말("u1", "카페"), 결과("i1", "p1"), 말("u2", "카드뉴스"), 결과("c1", "card-1", ""), 말("u3", "배너"), 결과("i2", "p2"),
      { id: "x", role: "image", body: "", workId: null },
    ];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "i1", workId: "p1" }, { n: 2, rowId: "c1", workId: "card-1" }, { n: 3, rowId: "i2", workId: "p2" },
    ]);
    expect(nextResultNumber(rows)).toBe(4);
  });

  /** Review Focus 4 · 6 — 2차 최종 리뷰 5 */
  it("표시 없는 옛 줄도 · 지운 작업 줄도 자리를 지킨다 — 지운 카드뉴스 앞에 있어도 이미지 번호가 안 바뀐다", () => {
    // 운영의 옛 줄: 표시 없는 빈 글. 첫 줄은 지운 카드뉴스, 둘째는 표시 없는 옛 포스터 줄.
    const rows = [결과("c-gone", "card-gone", ""), 결과("i-old", "p-old", "")];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "c-gone", workId: "card-gone" }, { n: 2, rowId: "i-old", workId: "p-old" },
    ]);
    // 지웠는지는 번호를 안 바꾼다 — 그 번호의 갈래만 바뀐다.
    expect(resultKindOf("card-gone", new Set(["p-old"]), new Set())).toBe("deleted");
    expect(resultKindOf("p-old", new Set(["p-old"]), new Set())).toBe("image");
    expect(resultKindOf("card-1", new Set(), new Set(["card-1"]))).toBe("cardnews");
  });

  it("고친 줄도 제 번호를 받고 무엇을 고쳤는지 안다 — 표시가 없는 옛 고친 줄은 같은 작업의 첫 줄", () => {
    const rows = [
      결과("i1", "p1"), 결과("i2", "p2"),
      결과("i3", "p1", withRowJob(withRowFrom(editRowBody("r3"), "i1"), 일감)),
      결과("i4", "p2", editRowBody("r4")),
    ];
    expect(numberEasyResults(rows)).toEqual([
      { n: 1, rowId: "i1", workId: "p1" }, { n: 2, rowId: "i2", workId: "p2" },
      { n: 3, rowId: "i3", workId: "p1", fromRowId: "i1" }, { n: 4, rowId: "i4", workId: "p2", fromRowId: "i2" },
    ]);
  });

  it("번호마다 갈래 · 만든 말 · 상태 · 고친 번호를 적고, 다 만든 이미지 번호만 고른다", () => {
    const rows = [
      말("u1", "카페 딸기라떼 포스터 만들어줘"), 결과("i1", "p1"),
      말("u2", "건강 카드뉴스"), 결과("c1", "card-1", ""),
      말("u3", "배경만 파랗게"), 결과("i2", "p1", withRowFrom(editRowBody("r2"), "i1")),
    ];
    const entries = describeEasyResults(rows, numberEasyResults(rows), (one) =>
      (one.workId === "card-1" ? { kind: "cardnews", state: "done" } : { kind: "image", state: one.n === 1 ? "done" : "making" }));
    expect(entries).toEqual([
      { n: 1, rowId: "i1", workId: "p1", kind: "image", state: "done", words: "카페 딸기라떼 포스터 만들어줘" },
      { n: 2, rowId: "c1", workId: "card-1", kind: "cardnews", state: "done", words: "건강 카드뉴스" },
      { n: 3, rowId: "i2", workId: "p1", fromRowId: "i1", fromN: 1, kind: "image", state: "making", words: "배경만 파랗게" },
    ]);
    expect(doneImageNumbers(entries)).toEqual([1]);
  });

  /** 리뷰 1차 수정 1 — 물음 뒤 결과물의 「만든 말」이 단추 답 글(「세로」)이 되면 처음 주문을 잃는다. */
  it("물음 사슬 뒤의 결과물은 처음 주문을 만든 말로 적는다 — 단추 답 글은 주문이 아니다", () => {
    const 물음줄 = (id: string, kind: Parameters<typeof askBody>[0]) =>
      ({ id, role: "assistant", body: askBody(kind, "물음입니다?"), workId: null });
    const 머리말 = (id: string) => ({ id, role: "assistant", body: sayBody("만들겠습니다."), workId: null });
    const 단추답 = [말("u1", "카페 포스터"), 물음줄("q1", "ratio"), 말("u2", withPick("세로", { ratio: "4:5" })), 머리말("s1"), 결과("i1", "p1")];
    const 말답 = [말("u1", "카페 포스터"), 물음줄("q1", "ratio"), 말("u2", "세로로"), 결과("i1", "p1")];
    const 번호말답 = [말("u1", "글자 크게"), 물음줄("q1", "target"), 말("u2", "2번"), 결과("i1", "p1")];
    const 그냥 = [말("u1", "배너 만들어줘"), 머리말("s1"), 결과("i1", "p1")];
    const 말들 = (rows: Parameters<typeof numberEasyResults>[0]) =>
      describeEasyResults(rows, numberEasyResults(rows), () => ({ kind: "image", state: "done" })).map((one) => one.words);
    expect(말들(단추답)).toEqual(["카페 포스터"]);
    // 말로 한 답은 라우트의 지시(`askInstruction`)처럼 처음 말 뒤에 잇는다. 번호만 고른 말 답은 잇지 않는다.
    expect(말들(말답)).toEqual(["카페 포스터 / 세로로"]);
    expect(말들(번호말답)).toEqual(["글자 크게"]);
    expect(말들(그냥)).toEqual(["배너 만들어줘"]);
  });

  /** 리뷰 1차 수정 2 — 조회가 실패한 작업은 지운 것이 아니라 모르는 것이다. */
  it("읽지 못한 작업은 지운 것이 아니라 「모름」이고 이름표는 「결과물 N」", () => {
    expect(resultKindOf("p9", new Set(), new Set(), new Set(["p9"]))).toBe("unknown");
    expect(resultKindOf("p1", new Set(["p1"]), new Set(), new Set(["p1"]))).toBe("image");
    expect(resultKindOf("gone", new Set(), new Set(), new Set(["p9"]))).toBe("deleted");
    expect(resultLabel("unknown", 4)).toBe("결과물 4");
  });

  it("화면 이름표는 갈래를 따른다 — 지운 것은 무엇이었는지 모를 수 있어 「결과물 N」", () => {
    expect(resultLabel("image", 3)).toBe("이미지 3");
    expect(resultLabel("cardnews", 2)).toBe("카드뉴스 2");
    expect(resultLabel("deleted", 1)).toBe("결과물 1");
  });
});
