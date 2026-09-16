import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { POSTER_STEPS } from "../../poster/steps";

/**
 * **설명서가 실제 화면과 같은 말을 하는가.**
 *
 * 2026-09-16 에 이미지 만들기의 차례를 바꿨는데(01 지시 → 02 레퍼런스 → 03 규격)
 * 설명서는 옛 차례를 그대로 설명하고 있었다. 배포 뒤 빌드를 뒤져 보고서야 찾았다.
 *
 * 설명서는 **틀려도 아무도 안 아프다.** 화면은 멀쩡히 돌고, 시험도 다 통과한다.
 * 그래서 값으로 재 둔다 — 단계를 또 바꾸는 날 여기서 걸린다.
 */

const source = readFileSync(new URL("../image/page.tsx", import.meta.url), "utf8");

describe("이미지 만들기 설명서", () => {
  /** 이름표를 손으로 옮겨 적으면 한쪽만 바뀌는 날이 온다. */
  it("단계 이름을 코드에서 가져온다", () => {
    expect(source).toContain('from "../../poster/steps"');
    expect(source).not.toMatch(/const STEPS = \[\s*"/);
  });

  /** 번호가 붙은 옛 이름은 본문 설명 안에도 남으면 안 된다 — 「03 한 줄 지시」처럼. */
  it("옛 차례가 남아 있지 않다", () => {
    for (const stale of ["01 레퍼런스", "02 규격", "03 지시", "03 한 줄"]) {
      expect(source).not.toContain(stale);
    }
  });

  /** 지금 차례의 이름표는 실제로 나와야 한다 — 안 나오면 설명서가 빈 셈이다. */
  it("지금 차례를 설명한다", () => {
    expect(POSTER_STEPS.map((step) => step.label)).toEqual([
      "01 지시", "02 레퍼런스", "03 규격", "04 기획 확인", "05 결과",
    ]);
    expect(source).toContain("01 지시");
    expect(source).toContain("02 레퍼런스");
  });

  /**
   * **「레퍼런스가 필수」라고 말하면 안 된다.** 이제 선택이다.
   * 설명서가 못 한다고 적어 두면 실제로는 되는 기능을 아무도 안 쓴다.
   */
  it("레퍼런스가 필수라고 말하지 않는다", () => {
    for (const stale of ["한 장 이상 필수", "레퍼런스 없이 시작할 수 없습니다", "한 장 이상 골라야"]) {
      expect(source).not.toContain(stale);
    }
  });

  it("글만으로도 된다고 알린다", () => {
    expect(source).toMatch(/글만|없어도|선택입니다/);
  });
});

/**
 * **결 이름을 손으로 적지 않는다.**
 *
 * 이름표는 `@fixup/shared` 가 갖고 다섯 도구가 함께 쓴다. 설명서가 손으로
 * 적었더니 2026-09-16 에 이름을 바꾼 뒤 **설명서만 옛 이름으로 남았다** —
 * 배포한 빌드를 뒤져 보고서야 찾았다. 단계 이름에서 이미 한 번 겪은 일이다.
 */
describe("그림체 이름", () => {
  it("코드에서 가져온다", () => {
    expect(source).toContain('from "@fixup/shared"');
    expect(source).toContain("IMAGE_LOOK_LABEL[look]");
  });

  it("옛 이름이 남아 있지 않다", () => {
    for (const stale of ["레퍼런스 따라가기", '{ title: "실사" }', '{ title: "애니" }']) {
      expect(source).not.toContain(stale);
    }
  });

  /** 첨부가 있어야 고를 수 있다는 것을 설명서도 말해야 한다. */
  it("레퍼런스가 있어야 고를 수 있다고 적는다", () => {
    expect(source).toContain("따라 만들 그림을 붙여야 고를 수 있습니다");
  });
});
