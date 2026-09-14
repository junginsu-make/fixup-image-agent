import { creditUnits } from "@fixup/shared";

/**
 * 광고 규격 내보내기의 원가와 크레딧.
 *
 * **다른 도구와 같은 공식을 쓴다**(사용자 결정 2026-09-14). 장은 실제로 낸
 * 돈에서 나온다 — `올림(원가 ÷ $0.05)`, 1원이라도 썼으면 최소 1장.
 *
 * 이 도구가 다른 점은 **새로 그리지 않는다**는 것뿐이다. 자르기·줄이기는 우리
 * CPU 만 쓰므로 원가가 0 이고, 밖에 돈을 내는 자리는 투명 배너를 만들 때의
 * 배경 제거 한 번뿐이다.
 *
 * **`server-only` 를 안 붙인다.** 순수 계산이라 시험과 화면 양쪽에서 읽는다 —
 * `lib/ad/derive.ts` 가 같은 이유로 갈라져 있다.
 */

/**
 * 배경 제거 한 번의 값.
 *
 * `lib/ad/master-plan.ts` 의 주석이 적어 둔 값이다(「그 호출값($0.003)이
 * 버려지지만, 잃는 것이 0.4원」). 같은 숫자를 두 곳에 적지 않도록 여기로
 * 모으고, `model_prices` 의 `fal-ai/birefnet/v2` 행도 같은 값이다.
 *
 * 청구서로 확인되면 여기와 그 행을 함께 고친다.
 */
export const BACKGROUND_REMOVAL_USD = 0.003;

/** 장부에 남길 모델 이름. `model_prices` 의 열쇠와 같아야 한다. */
export const BACKGROUND_REMOVAL_MODEL = "fal-ai/birefnet/v2";

/**
 * 이번 내보내기에 우리가 낸 돈.
 *
 * **마스터 한 장당 한 번이다.** 조립 규격을 여럿 골라도 같은 오브젝트를 나눠
 * 쓰므로(`batch.ts` 의 `cache.object`), 부른 횟수로 센다.
 */
export function adExportUsd(cutoutCalls: number): number {
  /*
    **숫자가 아닌 것을 거른다.** `Math.floor(NaN)` 은 NaN 이라 그대로 새고,
    그 NaN 이 장부의 `billable_images` 까지 간다. 크레딧 쪽은 `creditUnits` 가
    막아 주지만 원가 기록은 아무도 안 막는다 — 「돈이 안 나갔다」와 「모른다」가
    또 같은 모양이 된다.
  */
  if (!Number.isFinite(cutoutCalls)) return 0;
  const calls = Math.max(0, Math.floor(cutoutCalls));
  return Number((calls * BACKGROUND_REMOVAL_USD).toFixed(4));
}

/**
 * 이번 내보내기가 몇 장인가.
 *
 * **자르기·줄이기만 하면 0장이다.** 밖에 낸 돈이 없기 때문이다. 그래도 예약은
 * 거친다 — 0장짜리 예약도 정지된 계정과 한도 초과를 막는다. 「차감이 0」과
 * 「검사를 안 한다」는 다르다.
 */
export function adExportUnits(cutoutCalls: number): number {
  return creditUnits(adExportUsd(cutoutCalls));
}
