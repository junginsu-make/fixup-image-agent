import { describe, expect, it } from "vitest";
import { POSTER_STEPS, reachableBeforeCreate } from "../steps";

/**
 * 이미지 만들기의 **단계 차례.**
 *
 * 예전 차례는 「01 레퍼런스 → 02 규격 → 03 지시」였다. 첫 칸이 「따라 만들
 * 이미지」라서 **글만 들고 온 사람은 시작조차 못 했다**(2026-09-16 사용자 보고).
 *
 * 지금은 「무엇을 만들까」를 먼저 묻고, 그 다음에 따라 만들 그림이 있는지 묻는다.
 * 없으면 글만 모델로 간다 — 엔진은 진작부터 그럴 줄 알았다(`pickEndpoint`).
 *
 * **차례를 값으로 재 둔다.** 화면 안에만 있으면 누가 되돌려도 아무도 모른다.
 */

const ids = () => POSTER_STEPS.map((step) => step.id);

describe("단계 차례", () => {
  it("지시가 맨 앞이다", () => {
    expect(ids()[0]).toBe("instruction");
  });

  /** 그림을 붙이고 나서 규격을 봐야 「예상 비용」이 맞는 모드(t2i·i2i)로 계산된다. */
  it("레퍼런스가 규격보다 앞이다", () => {
    expect(ids().indexOf("reference")).toBeLessThan(ids().indexOf("spec"));
  });

  it("만들기 전 세 단계, 만든 뒤 두 단계", () => {
    expect(ids()).toEqual(["instruction", "reference", "spec", "plan", "result"]);
  });

  /** 번호가 곧 차례다. 어긋나면 막대와 본문이 다른 말을 한다. */
  it("이름표 번호가 차례와 같다", () => {
    POSTER_STEPS.forEach((step, index) => {
      expect(step.label.startsWith(`0${index + 1} `)).toBe(true);
    });
  });

  /** 레퍼런스가 선택이 됐다는 것이 이름표에 보여야 한다. */
  it("레퍼런스가 선택임을 적는다", () => {
    const reference = POSTER_STEPS.find((step) => step.id === "reference");
    expect(`${reference?.label} ${reference?.desc}`).toContain("선택");
  });
});

describe("만들기 전에 갈 수 있는 단계", () => {
  it("앞 세 단계는 열려 있다", () => {
    for (const id of ["instruction", "reference", "spec"]) {
      expect(reachableBeforeCreate(id)).toBe(true);
    }
  });

  /** 04·05 는 작업이 있어야 생긴다. 막대에는 보이되 갈 수는 없다. */
  it("기획·결과는 아직 못 간다", () => {
    expect(reachableBeforeCreate("plan")).toBe(false);
    expect(reachableBeforeCreate("result")).toBe(false);
  });
});
