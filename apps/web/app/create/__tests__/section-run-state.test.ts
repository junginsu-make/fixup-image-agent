import { describe, expect, it } from "vitest";
import { sectionRunState } from "../section-run-state";

/**
 * **섹션마다 「지금 무엇을 하고 있나」를 한 말로**(2026-10-08 사용자).
 *
 * 일괄 생성은 대상 섹션을 처음에 한꺼번에 잠근다(`generatingKeys`). 그런데
 * 요청은 묶음마다 차례로 간다 — 아직 보내지 않은 섹션까지 돌고 있는 것처럼
 * 보였다. 실제로 보낸 묶음(`inFlightKeys`)만 「만드는 중」이다.
 */
describe("섹션 상태", () => {
  const 실행 = (generatingKeys: string[], inFlightKeys: string[], settledKeys: string[] = []) =>
    ({ generatingKeys, inFlightKeys, settledKeys });

  it("**보낸 묶음에 든 섹션만 만드는 중이다**", () => {
    expect(sectionRunState("A", false, 실행(["A", "B"], ["A"]))).toBe("working");
  });

  it("**잠겼지만 아직 안 보낸 섹션은 차례 대기다**", () => {
    expect(sectionRunState("B", false, 실행(["A", "B"], ["A"]))).toBe("queued");
  });

  it("그림이 있는 섹션을 다시 만들면 만드는 중이다 — 완료보다 앞선다", () => {
    expect(sectionRunState("A", true, 실행(["A"], ["A"]))).toBe("working");
  });

  it("그림이 있는 섹션이 대기 중이면 차례 대기다", () => {
    expect(sectionRunState("A", true, 실행(["A", "B"], ["B"]))).toBe("queued");
  });

  it("돌지 않으면 그림이 있는 섹션은 완료, 없는 섹션은 만들기 전이다", () => {
    expect(sectionRunState("A", true, 실행([], []))).toBe("done");
    expect(sectionRunState("A", false, 실행([], []))).toBe("idle");
  });

  /*
    **돌아온 묶음은 다시 대기로 돌아가지 않는다.** 잠금은 일괄이 다 끝나야
    풀린다 — 돌아온 것을 따로 들지 않으면 첫 묶음이 끝난 섹션이 「차례 대기」로 보였다.
  */
  it("**돌아온 섹션은 그림이 붙었으면 완료**", () => {
    expect(sectionRunState("A", true, 실행(["A", "B"], ["B"], ["A"]))).toBe("done");
  });

  it("**돌아왔는데 그림이 없으면 실패** — 일괄은 그림 없는 섹션만 보낸다", () => {
    expect(sectionRunState("A", false, 실행(["A", "B"], ["B"], ["A"]))).toBe("failed");
  });

  it("**잠금이 풀린 섹션은 보낸 목록에 남아 있어도 돌지 않는다**", () => {
    // 잠금이 단추를 막는 기준이다. 표시가 그보다 오래 돌면 단추와 말이 어긋난다.
    expect(sectionRunState("A", true, 실행([], ["A"]))).toBe("done");
  });
});
