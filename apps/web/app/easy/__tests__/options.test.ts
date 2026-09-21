import { describe, expect, it } from "vitest";
import { easyOptionLines, easyOptionMeta } from "../options";

/**
 * **이 이미지가 어떤 조건으로 만들어졌나** (2026-09-21 사용자 — 「결과물 밑에
 * 바로 보이게해서 해당 이미지가 어떤 조건으로 만들어졌는지 쉽게 알게」).
 */

describe("결과 밑에 적을 조건", () => {
  it("아는 것만 차례대로 적는다", () => {
    expect(easyOptionLines({
      model: "gpt-image-2.5-flare",
      ratio: "1:1",
      width: 1088,
      height: 1088,
      references: 2,
    })).toEqual(["gpt-image-2.5-flare", "1:1", "1088 × 1088", "참고 2장"]);
  });

  /**
   * **모르는 칸은 아예 안 적는다.** 「모델 —」처럼 빈 채로 두면 읽는 사람이 그
   * 대시가 무슨 뜻인지 한 번 더 생각하게 된다.
   */
  it("모르는 칸은 빼고 적는다", () => {
    expect(easyOptionLines({ model: "nano-banana" })).toEqual(["nano-banana"]);
    expect(easyOptionLines({})).toEqual([]);
    expect(easyOptionLines(undefined)).toEqual([]);
  });

  /** 크기는 둘 다 있어야 뜻이 선다. 한쪽만 알면 안 적는다. */
  it("크기는 가로세로가 다 있을 때만", () => {
    expect(easyOptionLines({ width: 1088, height: null })).toEqual([]);
    expect(easyOptionLines({ width: null, height: 1088 })).toEqual([]);
  });

  /**
   * **0장은 값어치가 있다.** 「안 붙이고 만들었다」는 뜻이라, 빈 것과 다르다.
   */
  it("참고 0장은 적는다", () => {
    expect(easyOptionLines({ references: 0 })).toEqual(["참고 0장"]);
  });

  /**
   * **이름표를 안 붙인다.** 값 자체로 무엇인지 알아볼 수 있는 것들이라 이름표가
   * 자리만 차지한다. 숫자 홀로는 뜻이 안 서는 참고 장수만 말을 붙인다.
   */
  it("알아볼 수 있는 값에는 이름표를 안 붙인다", () => {
    const lines = easyOptionLines({ model: "nano-banana", ratio: "2:3", references: 1 });

    expect(lines).not.toContain("모델 nano-banana");
    expect(lines).not.toContain("비율 2:3");
    expect(lines).toContain("참고 1장");
  });
});

/**
 * **밑줄과 크게 보기 창은 같은 값을 다르게 낸다.**
 *
 * 결과 밑은 좁아서 값만 늘어놓고, 크게 보기 창은 설명을 읽는 자리라 이름표를
 * 붙인다. 두 곳이 서로 다른 것을 말하면 안 되므로 한 자리에서 같이 정한다.
 */
describe("크게 보기 창에 걸 이름표", () => {
  const 조건 = { model: "nano-banana", ratio: "2:3", width: 832, height: 1248, references: 1 };

  it("이름표와 값을 짝지어 준다", () => {
    expect(easyOptionMeta(조건)).toEqual([
      ["이미지 모델", "nano-banana"],
      ["비율", "2:3"],
      ["크기", "832 × 1248"],
      ["참고 이미지", "1장"],
    ]);
  });

  /** 같은 것을 말해야 한다. 한쪽에만 있는 칸이 생기면 둘이 갈린 것이다. */
  it("밑줄과 칸 수가 같다", () => {
    expect(easyOptionMeta(조건).length).toBe(easyOptionLines(조건).length);
    expect(easyOptionMeta({}).length).toBe(easyOptionLines({}).length);
    expect(easyOptionMeta(undefined)).toEqual([]);
  });
});
