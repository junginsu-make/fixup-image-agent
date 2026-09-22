import { describe, expect, it } from "vitest";
import { recoverLookWithoutReference } from "./pdp.look-recovery";

/**
 * **레퍼런스를 빼면 그림체 기준이 사라진다**(A-10).
 *
 * `auto` 는 「붙인 레퍼런스의 결을 따른다」는 뜻이다. 그런데 레퍼런스를 빼거나
 * 토글을 꺼도 **값은 `auto` 로 남는다.** 화면은 그 단추만 흐리게 만들 뿐이라,
 * 사용자는 여전히 `auto` 가 골라진 것을 보면서 **무엇을 따르는지 알 수 없다.**
 *
 * 설계 §6.3: 「`auto` 그림체의 레퍼런스를 제거/비활성화하면 **유효한 기본
 * 그림체로 복구하고 알린다.**」
 */

describe("따를 그림이 없으면 되돌린다", () => {
  it("**레퍼런스가 없는 auto 는 기본 결로 돌린다**", () => {
    const 복구 = recoverLookWithoutReference("auto", false);

    expect(복구?.look).toBe("photoreal");
  });

  it("**무슨 일이 있었는지 말한다** — 조용히 바꾸면 고른 것이 사라진 것처럼 보인다", () => {
    const 복구 = recoverLookWithoutReference("auto", false);

    expect(복구?.notice).toContain("레퍼런스");
    expect(복구?.notice.length).toBeGreaterThan(10);
  });

  it("레퍼런스가 있으면 그대로 둔다", () => {
    expect(recoverLookWithoutReference("auto", true)).toBeNull();
  });

  it("**사람이 고른 결은 건드리지 않는다**", () => {
    // 일러스트는 레퍼런스가 없어도 혼자 설 수 있다.
    for (const look of ["photoreal", "anime", "3d", "illustration"] as const) {
      expect(recoverLookWithoutReference(look, false)).toBeNull();
    }
  });
});
