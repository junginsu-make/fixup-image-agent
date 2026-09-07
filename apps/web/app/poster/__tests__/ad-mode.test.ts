import { describe, expect, it } from "vitest";
import { AD_SPECS } from "../../../lib/ad/specs";
import { adSubmitPlan } from "../ad-mode";

/**
 * 만들기 화면의 광고 모드 규칙 (설계 §10 3-c).
 *
 * **이 모듈이 §4.4 의 「생성 전에 막는다」를 배선한다.** 1~2단계는 파생이 생성
 * 뒤에 와서 실패해도 이미 만든 결과물이 멀쩡했다. 3단계는 순서가 뒤집혀
 * 파생 실패가 곧 **이미 과금된 생성이 쓸모없어짐**이다.
 */

// 4단계에서 투명 배경(png-alpha)이 조립으로 열렸다. 남은 미지원은 업로드뿐이다.
const supported = AD_SPECS
  .filter((spec) => spec.supply !== "upload")
  .map((spec) => spec.id);

describe("제출해도 되는가", () => {
  it("아무것도 안 고르면 못 한다", () => {
    const plan = adSubmitPlan([]);
    expect(plan.ready).toBe(false);
    expect(plan.reason).toMatch(/규격/);
  });

  it("되는 것만 고르면 한다", () => {
    const plan = adSubmitPlan(["google-rda-square", "naver-gfa-banner"]);
    expect(plan.ready).toBe(true);
    expect(plan.reason).toBeUndefined();
  });

  /**
   * **하나라도 막혀 있으면 전부 막는다.** 되는 것만 만들어 주면 사용자는 돈을
   * 쓰고 나서야 「비즈보드는 안 나왔네」를 안다 — 그때는 되돌릴 수 없다.
   */
  /**
   * **비즈보드는 4단계에서 열렸다.** 조립 엔진이 붙어 투명 배경을 만들 수
   * 있게 됐다. 아직 못 만드는 것은 **올려야 하는 로고**뿐이다 — 모델이 브랜드
   * 로고를 지어내면 매번 다른 로고가 나온다.
   */
  it("못 만드는 규격이 섞여 있으면 못 한다", () => {
    const plan = adSubmitPlan(["google-rda-square", "google-rda-logo"]);
    expect(plan.ready).toBe(false);
    expect(plan.reason).toContain("google-rda-logo");
  });

  it("막힌 까닭을 그대로 말한다 — 기다리면 되는지 다른 길인지 알아야 한다", () => {
    expect(adSubmitPlan(["google-rda-logo"]).reason).toMatch(/올려/);
  });

  it("모르는 규격 id 도 막는다", () => {
    expect(adSubmitPlan(["없는-규격"]).ready).toBe(false);
  });
});

describe("몇 장을 만드는가", () => {
  it("규격이 여럿이어도 마스터는 훨씬 적다", () => {
    const plan = adSubmitPlan(supported);
    expect(plan.masters.length).toBeLessThan(supported.length / 2);
  });

  it("만들 마스터를 순서대로 준다 — 첫 번째로 보낸다", () => {
    expect(adSubmitPlan(["google-rda-square"]).masters.map((m) => m.id)).toEqual(["ad-1x1"]);
  });

  /** 막혀 있으면 만들 것도 없어야 한다 — 화면이 「N장」을 잘못 세면 안 된다. */
  it("못 하는 상태에서는 만들 것을 세지 않는다", () => {
    expect(adSubmitPlan(["google-rda-square", "google-rda-logo"]).masters).toEqual([]);
  });
});
