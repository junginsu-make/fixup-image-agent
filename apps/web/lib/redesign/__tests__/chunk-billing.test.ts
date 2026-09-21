import { describe, expect, it } from "vitest";
import { chunkCreditUnits } from "../chunk-billing";
import { imageCreditUnits } from "../../credit-cost";

/**
 * **계산기를 직접 부르는 입구도 막는다**(F-7-7 리뷰, 2026-09-21).
 *
 * 경계(`readRedesignForm`)가 이미 `1 <= jobIndex <= jobTotal <= 10` 을 잰다.
 * 그래서 **라우트를 거치는 시험으로는 이 안쪽 방어에 닿지 않는다** — 변이로
 * 이 방어를 통째로 지워도 라우트 시험은 전부 초록이었다.
 *
 * 방어를 남겨 두는 이유는 입구가 하나가 아니게 될 수 있기 때문이다. 그러면
 * **그 입구에 맞는 자리에서 재야 한다.** 여기가 그 자리다.
 */

const 운영모델 = "gpt-image-2.5-flare";

describe("쪼갠 값이 합쳐서 한 번 올림이다", () => {
  it.each([2, 3, 4, 8, 10])("**%s 장을 한 장씩 나눠 받은 합이 한 번에 받은 값과 같다**", (n) => {
    let 합 = 0;
    for (let i = 1; i <= n; i += 1) {
      합 += chunkCreditUnits({ modelId: 운영모델, jobIndex: i, chunkCount: 1 })(1);
    }

    expect(합).toBe(imageCreditUnits(운영모델, n));
  });

  it("**중간에 멈추면 그때까지의 작업 값이다**", () => {
    let 합 = 0;
    for (let i = 1; i <= 3; i += 1) {
      합 += chunkCreditUnits({ modelId: 운영모델, jobIndex: i, chunkCount: 1 })(1);
    }

    expect(합).toBe(imageCreditUnits(운영모델, 3));
  });

  it("**못 만들었으면 0 이다**", () => {
    expect(chunkCreditUnits({ modelId: 운영모델, jobIndex: 3, chunkCount: 1 })(0)).toBe(0);
  });
});

/**
 * **자리를 꾸며도 0 이나 NaN 이 나오면 안 된다.**
 *
 * 0 은 그냥 싼 것이 아니다 — `reserve_generation` 의 동시 생성 검사는
 * `elsif p_units > 0 then` 안에 있고 월 한도 검사도 `+ 0` 이라 늘 통과한다.
 * NaN 은 `p_units: null` 로 나가 SQL 의 `not null` 제약에서 터지는데, 사용자
 * 에게는 「사용량을 확인하지 못했습니다」만 뜨고 원인은 안 남는다.
 */
describe("꾸민 자리로 공짜가 되지 않는다", () => {
  const 꾸민자리 = [
    ["아주 큰 수", 1e17],
    ["더 큰 수", 1e308],
    ["무한", Number.POSITIVE_INFINITY],
    ["숫자가 아님", Number.NaN],
    ["음수", -5],
    ["상한을 크게 넘음", 9999],
  ] as const;

  it.each(꾸민자리)("**%s 여도 한 장 값을 낸다**", (_label, jobIndex) => {
    const 낸것 = chunkCreditUnits({ modelId: 운영모델, jobIndex, chunkCount: 1 })(1);

    expect(Number.isFinite(낸것)).toBe(true);
    expect(낸것).toBeGreaterThan(0);
  });

  it.each(꾸민자리)("**%s 여도 정직한 값보다 한 칸 넘게 싸지 않다**", (_label, jobIndex) => {
    const 낸것 = chunkCreditUnits({ modelId: 운영모델, jobIndex, chunkCount: 1 })(1);
    const 정직한것 = imageCreditUnits(운영모델, 1);

    expect(정직한것 - 낸것).toBeLessThanOrEqual(1);
  });

  it("**청크 크기를 꾸며도 마찬가지다**", () => {
    for (const chunkCount of [1e17, Number.POSITIVE_INFINITY, Number.NaN, -3, 9999]) {
      const 낸것 = chunkCreditUnits({ modelId: 운영모델, jobIndex: 2, chunkCount })(1);

      expect(Number.isFinite(낸것), `chunkCount=${chunkCount}`).toBe(true);
      expect(낸것, `chunkCount=${chunkCount}`).toBeGreaterThan(0);
    }
  });

  /**
   * **만든 장수도 조여야 한다.** 여기를 안 조이면 두 항이 모두 무한이 되어
   * 차가 `NaN` 이고, 그것이 예약으로 나가면 장부가 터진다.
   */
  it("**만든 장수가 무한이어도 유한한 값을 낸다**", () => {
    for (const made of [Number.POSITIVE_INFINITY, 1e308, 9999]) {
      const 낸것 = chunkCreditUnits({ modelId: 운영모델, jobIndex: 2, chunkCount: 1 })(made);

      expect(Number.isFinite(낸것), `made=${made}`).toBe(true);
      expect(낸것, `made=${made}`).toBeGreaterThan(0);
      // 한 작업의 최대 장수를 넘겨 받지 않는다.
      expect(낸것, `made=${made}`).toBeLessThanOrEqual(imageCreditUnits(운영모델, 10));
    }
  });

  it("**만든 장수가 숫자가 아니면 0 이다** — 만든 것이 없다", () => {
    expect(chunkCreditUnits({ modelId: 운영모델, jobIndex: 2, chunkCount: 1 })(Number.NaN)).toBe(0);
  });

  /**
   * **자리를 안 말하면 전과 같다.** 옛 화면이나 바깥 호출이 들어와도 값이
   * 틀어지면 안 된다.
   */
  it("**자리가 없으면 한 장 값 그대로다**", () => {
    expect(chunkCreditUnits({ modelId: 운영모델, jobIndex: 0, chunkCount: 1 })(1))
      .toBe(imageCreditUnits(운영모델, 1));
  });

  /**
   * **모르는 모델이면 비싼 쪽으로 잡는다**(`imageCreditUnits` 의 판단).
   * 여기서 그것이 0 으로 무너지지 않는지 본다.
   */
  it("**모르는 모델이어도 0 이 아니다**", () => {
    expect(chunkCreditUnits({ modelId: "없는-모델", jobIndex: 5, chunkCount: 1 })(1))
      .toBeGreaterThan(0);
  });
});
