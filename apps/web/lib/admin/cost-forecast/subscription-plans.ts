import { z } from "zod";

/**
 * 월 구독 플랜 기본값 — 2026-09-22 사용자 확정.
 *
 * 크레딧·목표 마진·추가 할인 셋으로 월 가격을 정한다. 마진은 **와디즈
 * 수수료를 빼기 전** 값이고, 분모는 고객이 낸 금액(부가세 포함)이다.
 *
 * 목표 마진 기본값이 50·40·30 이 아니라 53.4·44.0·34.7 인 까닭: 확정 가격
 * (90,000·144,000·240,000원)을 그대로 내도록 그 가격의 마진을 넣어 두었다.
 * 50% 를 넣으면 83,000원이 된다(사용자 선택: 「확정 가격 유지」).
 */
export const PLAN_ASSUMPTIONS = Object.freeze({
  costPerCreditKrw: 450, // 1장 원가 예산. 재생성·실패 여유 포함, 실측 아님
  vatPct: 10,
  wadizFeePct: 15,
  overheadPct: 10, // 서버·DB·와디즈 기본료·모집 이벤트·고객 응대
  priceStepKrw: 1_000,
  /*
    **카드뉴스는 5장으로 센다**(2026-09-23 사용자). 비용 전략의 작업 표는
    처음부터 「6카드 중 생성 이미지 5장 가정」이었는데 여기만 8이라, 같은
    화면에서 두 숫자가 갈려 있었다.
  */
  usage: { pdp: 9, cardnews: 5, print: 2 },
});

const planSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(1).max(40),
  credits: z.number().int().min(1).max(100_000),
  targetPct: z.number().min(0).max(90),
  discountPct: z.number().min(0).max(90),
}).strict();
export type PlanInput = z.infer<typeof planSchema>;

/**
 * **2026-09-23 사용자 확정값.**
 *
 * 월 가격 89,000·159,000·299,000원에서 추가 할인을 얹어 실제로 받는 돈이
 * 62,033·109,074·209,898원이 된다. 1개당 827·727·700원.
 */
export const PLAN_DEFAULTS: readonly PlanInput[] = Object.freeze([
  { id: "basic", name: "Basic", credits: 75, targetPct: 53, discountPct: 30.3 },
  { id: "premium", name: "Premium", credits: 150, targetPct: 48.5, discountPct: 31.4 },
  { id: "ultra", name: "Ultra", credits: 300, targetPct: 45.8, discountPct: 29.8 },
]);

export function validatePlanInputs(input: unknown): PlanInput[] {
  return z.array(planSchema).min(1).max(8).parse(input);
}

export interface PricedPlan extends PlanInput {
  listPrice: number; paidPrice: number; unitPrice: number;
  marginPct: number; wadizMarginPct: number; allInMarginPct: number;
  bonusPct: number; unitDiscountPct: number;
  usage: { pdp: number; cardnews: number; images: number; print: number };
}

const a = PLAN_ASSUMPTIONS;
const vatShare = a.vatPct / (100 + a.vatPct);

/** 부가세 포함 결제액에서 부가세·수수료 비율·원가를 뺀 나머지의 비율(%). */
function marginAt(paid: number, credits: number, feePct: number): number {
  return ((paid - paid * vatShare - paid * feePct / 100 - credits * a.costPerCreditKrw) / paid) * 100;
}

function listPriceFor(credits: number, targetPct: number): number {
  const exact = (credits * a.costPerCreditKrw) / (1 - vatShare - targetPct / 100);
  return Math.max(a.priceStepKrw, Math.round(exact / a.priceStepKrw) * a.priceStepKrw);
}

/** 첫 플랜을 기준으로 고객 혜택을 비교한다. */
export function pricePlans(input: readonly PlanInput[]): PricedPlan[] {
  const plans = validatePlanInputs(input).map(p => {
    const listPrice = listPriceFor(p.credits, p.targetPct);
    const paidPrice = Math.round(listPrice * (1 - p.discountPct / 100));
    return {
      ...p, listPrice, paidPrice, unitPrice: paidPrice / p.credits,
      marginPct: marginAt(paidPrice, p.credits, 0),
      wadizMarginPct: marginAt(paidPrice, p.credits, a.wadizFeePct),
      allInMarginPct: marginAt(paidPrice, p.credits, a.wadizFeePct + a.overheadPct),
      usage: {
        pdp: Math.floor(p.credits / a.usage.pdp), cardnews: Math.floor(p.credits / a.usage.cardnews),
        images: p.credits, print: Math.floor(p.credits / a.usage.print),
      },
    };
  });
  const baseUnit = plans[0]!.unitPrice;
  return plans.map(p => ({
    ...p,
    bonusPct: Math.round((baseUnit / p.unitPrice - 1) * 100),
    unitDiscountPct: Math.round((1 - p.unitPrice / baseUnit) * 100),
  }));
}
