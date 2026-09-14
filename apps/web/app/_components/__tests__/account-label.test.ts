import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accountAriaLabel, emailLocalPart } from "../account-label";

/**
 * 로그인한 계정이 화면에 보이는지.
 *
 * 주소가 배지의 마우스오버 설명에만 있었다. 관리자 계정이 둘이 되면서, 어느
 * 쪽으로 들어와 있는지 모르는 채로 남의 자료를 만질 위험이 생겼다(2026-09-14).
 */

const WEB = process.cwd();
const actions = readFileSync(path.join(WEB, "app/_components/studio-actions.tsx"), "utf8");

describe("이메일 앞부분", () => {
  it("@ 앞을 떼어 낸다", () => {
    expect(emailLocalPart("ai.dev@fixupworld.com")).toBe("ai.dev");
    expect(emailLocalPart("9843ohs@gmail.com")).toBe("9843ohs");
  });

  /** 두 관리자 계정은 앞부분만으로도 갈려야 한다. */
  it("두 관리자가 앞부분만으로 구분된다", () => {
    expect(emailLocalPart("ai.dev@fixupworld.com")).not.toBe(
      emailLocalPart("9843ohs@gmail.com"),
    );
  });

  it("앞뒤 공백을 떼어 낸다", () => {
    expect(emailLocalPart("  ai.dev@fixupworld.com  ")).toBe("ai.dev");
  });

  /**
   * **빈 글자를 내놓지 않는다.** 화면에 아무것도 안 남으면 로그인을 안 한
   * 것처럼 보인다. 주소 꼴이 아니면 받은 그대로 보여 주는 편이 낫다.
   */
  it("주소 꼴이 아니어도 무언가는 남는다", () => {
    for (const odd of ["운영자", "@fixupworld.com", "no-at-sign"]) {
      expect(emailLocalPart(odd).length).toBeGreaterThan(0);
    }
  });

  it("@ 가 여럿이어도 첫 번째에서 자른다", () => {
    expect(emailLocalPart("a@b@c.com")).toBe("a");
  });
});

describe("화면 낭독기", () => {
  /** 주소만 읽어 주면 그것이 무엇인지 모른다. */
  it("무엇의 주소인지 말한다", () => {
    const label = accountAriaLabel("ai.dev@fixupworld.com");
    expect(label).toContain("ai.dev@fixupworld.com");
    expect(label).toContain("로그인");
  });
});

describe("화면에 실제로 걸려 있다", () => {
  it("상단에 주소를 그린다", () => {
    expect(actions).toContain("{email}");
    expect(actions).toContain("emailLocalPart(email)");
  });

  /**
   * 넓은 화면은 주소 전체, 좁은 화면은 앞부분. 둘 중 하나만 있으면 한쪽
   * 화면에서 아무것도 안 보이거나 줄이 넘친다.
   */
  it("넓은 화면과 좁은 화면을 나눠 그린다", () => {
    expect(actions).toContain("hidden lg:inline");
    expect(actions).toContain("lg:hidden");
  });

  /** 감싸는 칸 하나만 본다. 안쪽 두 칸은 넓이에 따라 갈릴 뿐이다. */
  const wrapper = (() => {
    const at = actions.indexOf("emailLocalPart(email)");
    const open = actions.lastIndexOf("<span", actions.lastIndexOf("max-w-", at));
    return actions.slice(open, at);
  })();

  /** 잘려도 전체를 확인할 길이 남아야 한다. */
  it("잘린 주소의 전체를 확인할 수 있다", () => {
    expect(wrapper).toContain("title={email}");
    expect(wrapper).toContain("accountAriaLabel(email)");
  });

  /** 긴 주소가 줄을 밀어내면 로그아웃 단추가 화면 밖으로 나간다. */
  it("길어져도 자리를 넘지 않는다", () => {
    expect(wrapper).toContain("truncate");
    expect(wrapper).toContain("max-w-");
  });
});
