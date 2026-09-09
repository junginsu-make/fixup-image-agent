import { describe, expect, it } from "vitest";
import { canReachStep } from "../step-jump";

/**
 * 막대를 눌렀는데 아무 일이 안 일어나면 사용자는 고장으로 읽는다.
 * 반대로 아직 없는 화면으로 보내면 빈 화면이 나온다.
 */

const 시작전 = { hasResult: false };
const 구성안있음 = { hasResult: true };

describe("구성안이 없을 때", () => {
  it("1단계로는 언제나 갈 수 있다", () => {
    expect(canReachStep("upload", 시작전)).toBe(true);
  });

  it("나머지는 아직 갈 데가 없다", () => {
    expect(canReachStep("analyze", 시작전)).toBe(false);
    expect(canReachStep("sections", 시작전)).toBe(false);
    expect(canReachStep("edit", 시작전)).toBe(false);
  });
});

describe("구성안이 만들어진 뒤", () => {
  it("네 단계를 다 오갈 수 있다", () => {
    for (const id of ["upload", "analyze", "sections", "edit"]) {
      expect(canReachStep(id, 구성안있음)).toBe(true);
    }
  });
});

describe("모르는 단계", () => {
  /** 목록이 늘었는데 여기를 안 고치면, 새 단계가 조용히 막히거나 조용히 열린다. */
  it("구성안 여부를 따른다", () => {
    expect(canReachStep("mystery", 시작전)).toBe(false);
    expect(canReachStep("mystery", 구성안있음)).toBe(true);
  });
});
