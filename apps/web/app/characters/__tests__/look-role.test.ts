import { describe, expect, it } from "vitest";
import { resolveLook } from "@fixup/shared";
import { lookAfterRole, roleAfterLook } from "../look-role";

/**
 * **「레퍼런스 스타일」은 한 스위치가 두 자리에 나오는 것이다.**
 *
 * 그림체에도 있고 「이 그림의 역할」에도 있다. 따로 움직이면 사용자는 「이 둘이
 * 뭐가 다르지」부터 풀어야 한다.
 *
 * 이건 화면 편의가 아니라 **프롬프트가 요구하는 것**이다. 역할 `extract` 의
 * 지시문이 「화풍은 아래에서 따로 정한다」고 못 박으므로, 거기에 「레퍼런스
 * 스타일」을 붙이면 **아래에 아무 말도 없는** 프롬프트가 나간다.
 */

describe("역할을 고를 때", () => {
  it("「레퍼런스 스타일」이면 그림체도 그것이 된다", () => {
    expect(lookAfterRole("style", "anime")).toBe("auto");
  });

  /** 「뽑아내기」는 그림체를 따로 정해야 한다. 지시문이 그렇게 적혀 있다. */
  it("「뽑아내기」면 그림체를 내려 준다", () => {
    expect(lookAfterRole("extract", "auto")).not.toBe("auto");
  });

  it("「뽑아내기」인데 이미 구체적이면 그대로 둔다", () => {
    for (const look of ["photoreal", "anime", "3d", "illustration"] as const) {
      expect(lookAfterRole("extract", look)).toBe(look);
    }
  });
});

describe("그림체를 고를 때", () => {
  it("「레퍼런스 스타일」이면 역할도 그것이 된다", () => {
    expect(roleAfterLook("auto")).toBe("style");
  });

  it("구체적인 그림체면 「뽑아내기」가 된다", () => {
    for (const look of ["photoreal", "anime", "3d", "illustration"] as const) {
      expect(roleAfterLook(look)).toBe("extract");
    }
  });
});

describe("두 자리가 늘 짝이 맞는다", () => {
  /** 어느 쪽을 골라도 반대쪽이 따라와, 부딪히는 짝이 안 생긴다. */
  it("역할을 고른 뒤 짝이 맞는다", () => {
    for (const role of ["style", "extract"] as const) {
      for (const look of ["auto", "photoreal", "anime"] as const) {
        const 새그림체 = lookAfterRole(role, look);

        expect(roleAfterLook(새그림체), `${role}+${look} 이 어긋난다`).toBe(role);
      }
    }
  });

  it("그림체를 고른 뒤 짝이 맞는다", () => {
    for (const look of ["auto", "photoreal", "anime", "3d", "illustration"] as const) {
      const 새역할 = roleAfterLook(look);

      expect(lookAfterRole(새역할, look), `${look} 이 어긋난다`).toBe(look);
    }
  });
});

/**
 * **내려갈 곳이 서버와 같아야 한다.**
 *
 * 화면이 「레퍼런스 스타일」에서 내려올 때 고르는 것과, 서버가 첨부 없는
 * `auto` 를 떨어뜨리는 곳이 갈리면, 화면이 켜 보인 것과 실제로 그려지는 것이
 * 달라진다.
 */
describe("서버와 같은 곳으로 내린다", () => {
  it("내려간 그림체가 resolveLook 과 같다", () => {
    expect(lookAfterRole("extract", "auto")).toBe(resolveLook("auto", false));
  });
});
