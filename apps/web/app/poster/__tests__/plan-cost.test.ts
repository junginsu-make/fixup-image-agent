import { describe, expect, it } from "vitest";
import { planCostUsd, planCostNote } from "../plan-cost";

/**
 * **「그대로 생성」은 기획 LLM 값이 안 든다.**
 *
 * 03 의 「예상 비용」은 그림 값만 적는다. 기획은 따로 돌고 따로 차감되는데
 * (`plan/route.ts` 가 `reserveAiUsage` 를 부른다) 화면이 그 얘기를 안 한다.
 *
 * 「그대로 생성」을 고르면 기획이 아예 안 돈다. **안 드는 값을 안 든다고 말해야**
 * 두 갈래를 견줄 수 있다(설계 §9 의 열어 둔 물음).
 *
 * **화면 밖에서 잰다.** `.tsx` 안에 두면 「얼마가 빠지는가」를 값으로 못 잰다.
 */

describe("기획에 드는 값", () => {
  /** 기획 LLM 한 번. 첨부를 안 읽으면 이것뿐이다. */
  it("첨부가 없으면 기획 한 번 값이다", () => {
    expect(planCostUsd({ referenceCount: 0 })).toBeCloseTo(0.014, 4);
  });

  /** 첨부는 한 장씩 비전으로 읽는다. 장수만큼 붙는다. */
  it("첨부를 읽는 값이 장수만큼 붙는다", () => {
    expect(planCostUsd({ referenceCount: 2 })).toBeCloseTo(0.014 + 0.02, 4);
  });

  /** 쓴 그대로면 기획이 아예 안 돈다. */
  it("그대로 생성이면 0 이다", () => {
    expect(planCostUsd({ referenceCount: 3, promptMode: "verbatim" })).toBe(0);
  });
});

describe("화면에 할 말", () => {
  /**
   * **안 드는 값을 안 든다고 말한다.** 그래야 「AI 가 다듬어서」와 견줄 수 있다.
   */
  it("그대로 생성이면 기획 값이 빠진다고 알린다", () => {
    const note = planCostNote({ referenceCount: 1, promptMode: "verbatim" });

    expect(note).toContain("기획");
    expect(note).toContain("안 듭니다");
  });

  /** 다듬어서면 얼마가 더 드는지 숫자로 말한다. 「추가로 든다」만으로는 못 견준다. */
  it("다듬어서면 얼마가 더 드는지 적는다", () => {
    const note = planCostNote({ referenceCount: 0, promptMode: "assisted" });

    expect(note).toContain("0.014");
    expect(note).toContain("기획");
  });

  it("첨부가 있으면 그 몫까지 더해 적는다", () => {
    const note = planCostNote({ referenceCount: 2, promptMode: "assisted" });

    expect(note).toContain("0.034");
  });

  /** 광고 모드는 규격마다 작업이 따로 생긴다. 기획도 그만큼 돈다. */
  it("작업이 여럿이면 곱해서 적는다", () => {
    const note = planCostNote({ referenceCount: 0, promptMode: "assisted", projects: 3 });

    expect(note).toContain("0.042");
  });
});
