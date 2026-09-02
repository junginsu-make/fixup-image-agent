import { describe, expect, it } from "vitest";
import { stepState, canJumpTo } from "../step-bar";

const steps = [
  { id: "a", label: "내용" },
  { id: "b", label: "이미지" },
  { id: "c", label: "규격" },
];

describe("단계 상태", () => {
  it("지난 단계는 done, 현재는 active, 남은 것은 todo", () => {
    expect(stepState(steps, "b", "a")).toBe("done");
    expect(stepState(steps, "b", "b")).toBe("active");
    expect(stepState(steps, "b", "c")).toBe("todo");
  });

  it("모르는 단계는 todo 로 본다", () => {
    expect(stepState(steps, "b", "없음")).toBe("todo");
  });
});

describe("이동 가능 여부", () => {
  it("지난 단계로는 돌아갈 수 있다", () => {
    // 리디자인은 대시보드로 돌아가야 한다. 막으면 막다른 길이 생긴다.
    expect(canJumpTo(steps, "c", "a")).toBe(true);
  });

  it("현재 단계는 눌러도 아무 일이 없다", () => {
    expect(canJumpTo(steps, "b", "b")).toBe(false);
  });

  it("앞 단계로도 갈 수 있다", () => {
    // 돌아가서 고치고 다시 앞으로 오는 일이 잦다. 매번 「다음」을 여러 번
    // 누르게 하지 않는다. 준비가 안 됐으면 그 화면이 알린다.
    expect(canJumpTo(steps, "a", "c")).toBe(true);
  });
});
