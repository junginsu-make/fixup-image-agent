import { describe, expect, it } from "vitest";
import { qaStatusOf } from "./pdp.qa";

/**
 * **검수를 못 돌린 것과 통과한 것을 구별한다.**
 *
 * `runQaGate` 는 호출이나 파싱이 실패하면 `{ defects: [], parseError: true }` 를
 * 돌려준다(fail-open). 그런데 부르는 쪽은 `blocking.length === 0` 만 보고
 * **`passed: true` 로 내보냈다.** 검수가 한 번도 안 돌았는데 통과로 적힌다.
 *
 * 설계 §10.2: 「결과 상태: `passed | failed | review_required | unavailable`.
 * **검수 실패는 통과가 아니다.**」
 */
describe("검수 결과 상태", () => {
  it("결함이 없으면 통과다", () => {
    expect(qaStatusOf({ defects: [] }, { blocking: [], warnings: [] })).toBe("passed");
  });

  it("막는 결함이 있으면 실패다", () => {
    const 결함 = [{ kind: "text_mismatch", detail: "제목이 다르다" }] as never[];

    expect(qaStatusOf({ defects: 결함 }, { blocking: 결함, warnings: [] })).toBe("failed");
  });

  it("**검수를 못 돌렸으면 unavailable** — 통과가 아니다", () => {
    expect(qaStatusOf({ defects: [], parseError: true }, { blocking: [], warnings: [] })).toBe("unavailable");
  });

  it("**못 돌린 채로 결함이 없어도 통과로 안 본다**", () => {
    const 상태 = qaStatusOf({ defects: [], parseError: true }, { blocking: [], warnings: [] });

    expect(상태).not.toBe("passed");
  });

  it("경고만 있으면 사람이 봐야 한다", () => {
    const 경고 = [{ kind: "layout_risk", detail: "글자가 가장자리에 붙었다" }] as never[];

    expect(qaStatusOf({ defects: 경고 }, { blocking: [], warnings: 경고 })).toBe("review_required");
  });

  it("막는 결함이 경고보다 세다", () => {
    const 막음 = [{ kind: "text_mismatch", detail: "x" }] as never[];
    const 경고 = [{ kind: "layout_risk", detail: "y" }] as never[];

    expect(qaStatusOf({ defects: [...막음, ...경고] }, { blocking: 막음, warnings: 경고 })).toBe("failed");
  });
});
