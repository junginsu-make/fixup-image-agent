import { planDerivation } from "./derive";
import { AD_MASTERS, AD_SPECS, type AdMaster } from "./specs";

/**
 * 고른 규격에서 **만들어야 할 마스터를 역산한다.**
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 3단계 항목 2·4
 *
 * **이 모듈이 없으면 3단계는 위험하다.** 1~2단계는 파생이 생성보다 뒤에 와서,
 * 파생이 실패해도 이미 만든 결과물은 멀쩡했다. 3단계는 순서가 뒤집힌다 —
 * 생성이 **먼저**라 파생 실패가 곧 **이미 과금된 생성이 쓸모없어짐**이다(§4.4).
 * 그래서 `planDerivation` 을 **생성 전에** 돌려 만들 수 없는 규격을 걸러낸다.
 * 이 저장소는 같은 판단을 이미 한다 — 「만들 수 없는 조합은 제출조차 하지
 * 않는다」(`lib/__tests__/poster-flow.test.ts`).
 *
 * **순수하다.** 생성을 부르지 않고 sharp 도 안 탄다 — 화면과 서버가 같은 답을
 * 보게 하려면 양쪽에서 부를 수 있어야 한다.
 */

/** 모르는 id 를 화면에 그대로 찍지 않는다. `batch.ts` 가 같은 값을 쓴다. */
const MAX_ID_ECHO = 64;

export interface BlockedSpec {
  specId: string;
  /** 왜 못 만드는가. 화면이 그대로 적는다. */
  reason: string;
}

export interface MasterPlan {
  /**
   * 만들어야 할 마스터. **길이가 「만들 그림 N장」의 N 이다.**
   *
   * 규격 10개를 골라도 두세 장이라는 것이 이 기능의 핵심이다(§9 원칙 2).
   */
  masters: AdMaster[];
  /** 과금 전에 걸러낸 규격. 비어 있지 않으면 화면이 먼저 말한다. */
  blocked: BlockedSpec[];
}

export function planMasters(specIds: string[]): MasterPlan {
  const masters = new Map<string, AdMaster>();
  const blocked: BlockedSpec[] = [];
  const seen = new Set<string>();

  for (const specId of specIds) {
    if (seen.has(specId)) continue;
    seen.add(specId);

    const spec = AD_SPECS.find((entry) => entry.id === specId);
    if (!spec) {
      blocked.push({ specId: specId.slice(0, MAX_ID_ECHO), reason: "모르는 규격입니다." });
      continue;
    }

    const plan = planDerivation(spec);
    if (plan.kind === "upload" || plan.kind === "unsupported") {
      blocked.push({ specId: spec.id, reason: plan.reason });
      continue;
    }

    const master = AD_MASTERS.find((entry) => entry.id === plan.master);
    // 파생 계획이 준 마스터 id 는 `AD_MASTERS` 에서 나온 것이라 여기 못 오지만,
    // 못 찾은 채로 넘기면 **크기 없이 생성을 부르게 된다.**
    if (!master) {
      blocked.push({ specId: spec.id, reason: "마스터를 찾지 못했습니다." });
      continue;
    }
    masters.set(master.id, master);
  }

  return { masters: [...masters.values()], blocked };
}
