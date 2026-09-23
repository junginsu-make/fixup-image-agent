import { pricePlans, type PlanInput } from "./cost-forecast/subscription-plans";

/**
 * **비용 전략에서 정한 플랜을 실제 구독 플랜으로 옮긴다**(2026-09-23 사용자 요청).
 *
 * ── 무엇이 달라지나 ────────────────────────────────────────
 *
 * 그동안 비용 전략은 **브라우저에만 저장**됐다. 화면에도 그렇게 적혀
 * 있었다 — 「실제 결제 상품이나 회원에게 지급하는 크레딧은 바꾸지 않습니다」.
 *
 * 사용자가 그 약속을 바꿨다. 이제 「저장」을 누르면 `subscription_plans` 에
 * 들어가고, **회원 관리에서 등급을 줄 때 이 값이 그대로 쓰인다.**
 *
 * ── 값 대응 ────────────────────────────────────────────────
 *
 * | 비용 전략 | 구독 플랜 | 왜 |
 * |---|---|---|
 * | 크레딧 | `monthly_units` | 한 달에 주는 수 |
 * | **고객 결제액** | `price_krw` | 할인까지 뺀 **실제로 받는 돈**(2026-09-23 사용자 결정) |
 *
 * **월 가격이 아니라 고객 결제액이다.** 회원 관리에 뜨는 금액이 실제
 * 청구액과 달라지면, 결제 확인을 할 때 어느 쪽이 맞는지 다시 따져야 한다.
 *
 * ── 이미 구독 중인 회원 ────────────────────────────────────
 *
 * **플랜 정의만 바꾼다**(2026-09-23 사용자 결정). 이미 지급된 이번 달
 * 크레딧은 건드리지 않고, 다음 지급부터 새 수가 적용된다. 줄이는 쪽으로
 * 바꿨을 때 이미 쓴 사람이 마이너스가 되는 일을 만들지 않는다.
 */

export interface SubscriptionPlanRow {
  id: string;
  name: string;
  monthly_units: number;
  price_krw: number;
  active: boolean;
}

/**
 * 저장할 줄들.
 *
 * **여기서 값을 새로 정하지 않는다.** 가격은 `pricePlans` 가 정한 그대로다 —
 * 두 벌로 계산하면 화면에 보이는 값과 저장되는 값이 갈리는 날이 온다.
 */
export function planRowsToSave(input: readonly PlanInput[]): SubscriptionPlanRow[] {
  return pricePlans(input).map((plan) => ({
    id: plan.id,
    name: plan.name,
    monthly_units: plan.credits,
    // 할인까지 뺀 실제로 받는 돈. 원 단위 정수다 — 표의 제약이 정수다.
    price_krw: Math.round(plan.paidPrice),
    /*
      **저장한 플랜은 쓸 수 있는 플랜이다.** 꺼 두면 회원 관리의 고르개에
      안 뜨고, 그러면 저장한 의미가 없다. 끄는 일은 플랜을 없앨 때이고
      그것은 여기서 하지 않는다.
    */
    active: true,
  }));
}
