import { describe, expect, it } from "vitest";
import { AD_SPECS } from "../ad/specs";
import { planMasters } from "../ad/master-plan";

/**
 * 고른 규격에서 **만들어야 할 마스터를 역산한다.**
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3단계 항목 2·4
 *
 * 이 모듈이 답하는 질문은 둘이다.
 * - **몇 장을 만드는가** — 규격 10개를 골라도 생성은 두세 장이라는 것이 이 기능의
 *   핵심인데, 안 보여 주면 사용자는 10배 과금을 걱정한다(§9 원칙 2)
 * - **과금 전에 막아야 할 것이 있는가** — 3단계는 생성이 **먼저**라 파생 실패가
 *   곧 **이미 과금된 생성이 쓸모없어짐**이다(§4.4)
 */

describe("만들 그림이 몇 장인가", () => {
  it("규격을 하나도 안 고르면 만들 것이 없다", () => {
    const plan = planMasters([]);
    expect(plan.masters).toEqual([]);
    expect(plan.blocked).toEqual([]);
  });

  /**
   * **이 시험이 이 기능의 존재 이유다.** 규격 수와 생성 수가 따로 논다는 것을
   * 못 박는다 — 여기가 깨지면 「규격 10개 = 10배 과금」이 되어 기능이 무의미해진다.
   */
  it("규격이 여럿이어도 마스터는 훨씬 적다", () => {
    const supported = AD_SPECS.filter(
      (spec) => spec.format !== "png-alpha" && spec.supply !== "upload",
    );
    const plan = planMasters(supported.map((spec) => spec.id));
    expect(supported.length).toBeGreaterThan(10);
    expect(plan.masters.length).toBeLessThan(supported.length / 2);
  });

  it("같은 마스터를 쓰는 규격들을 한 장으로 합친다", () => {
    // 구글 정사각과 카카오 정사각은 둘 다 1200×1200 이라 같은 마스터다.
    expect(planMasters(["google-rda-square", "kakao-display-square"]).masters).toHaveLength(1);
  });

  it("마스터에 실제 픽셀이 실려 온다 — 생성이 그것을 넘긴다", () => {
    expect(planMasters(["google-rda-square"]).masters[0])
      .toMatchObject({ id: "ad-1x1", width: 1200, height: 1200 });
  });

  it("같은 규격을 두 번 골라도 두 장이 되지 않는다", () => {
    expect(planMasters(["google-rda-square", "google-rda-square"]).masters).toHaveLength(1);
  });
});

describe("과금 전에 막는다", () => {
  /**
   * §4.4: 3단계는 생성이 **먼저**다. 만들 수 없는 규격을 그냥 두면 돈을 쓰고 나서
   * 「이건 못 뽑습니다」를 보게 된다.
   */
  it("투명 배경 규격은 까닭과 함께 막는다", () => {
    expect(planMasters(["kakao-bizboard"]).blocked).toEqual([
      { specId: "kakao-bizboard", reason: expect.stringContaining("투명") },
    ]);
  });

  it("올려야 하는 규격도 막는다 — 모델이 지어내면 안 된다", () => {
    expect(planMasters(["google-rda-logo"]).blocked.map((entry) => entry.specId))
      .toEqual(["google-rda-logo"]);
  });

  it("막힌 규격 때문에 마스터를 만들지 않는다", () => {
    expect(planMasters(["kakao-bizboard"]).masters).toEqual([]);
  });

  /**
   * **막힌 것이 섞여 있어도 나머지는 만든다.** 하나 때문에 전부 못 만들면
   * 사용자는 무엇을 빼야 하는지 모른 채 되돌아간다.
   */
  it("막힌 것과 되는 것이 섞이면 되는 것만 만든다", () => {
    const plan = planMasters(["kakao-bizboard", "google-rda-square"]);
    expect(plan.masters.map((master) => master.id)).toEqual(["ad-1x1"]);
    expect(plan.blocked.map((entry) => entry.specId)).toEqual(["kakao-bizboard"]);
  });

  it("모르는 규격 id 는 조용히 버리지 않는다", () => {
    const plan = planMasters(["없는-규격"]);
    expect(plan.blocked.map((entry) => entry.specId)).toEqual(["없는-규격"]);
    expect(plan.masters).toEqual([]);
  });

  /** 모르는 id 가 화면에 그대로 찍히면 안 된다 — `batch.ts` 가 같은 판단을 한다. */
  it("모르는 id 를 잘라서 담는다", () => {
    expect(planMasters(["x".repeat(200)]).blocked[0]!.specId.length).toBeLessThanOrEqual(64);
  });
});
