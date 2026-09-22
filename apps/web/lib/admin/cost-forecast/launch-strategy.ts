import { z } from "zod";
import { validateScenario, type Scenario } from "./schema";
import { estimateWork } from "./work-profiles";
import { simulateMember } from "./usage";
import { forecast } from "./forecast";

const amount = z.number().finite().min(0).max(1e9);
export const launchSchema = z.object({
  version: z.literal(1), targetMarginPct: z.number().min(0).max(95),
  // Older saved comparisons used net sales; preserve that history explicitly.
  marginBasis: z.enum(["payment", "net-sales"]).default("net-sales"),
  feeMode: z.enum(["assumed-total", "official-cash"]), feePct: z.number().min(0).max(50),
  projectFeeKrw: amount, adBudgetKrw: amount, eventRecipients: amount.int(), eventCredits: amount.int(),
  policy: z.enum(["cost-v1", "image-v2"]),
  plans: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/), name: z.string().max(40),
    type: z.enum(["subscription", "purchase"]), priceKrw: amount.positive(), baseCredits: amount.int().positive(),
    bonusPct: z.number().min(0).max(200), buyers: amount.int().max(1e6),
    reserveMonths: z.number().int().min(1).max(36),
  }).strict()).min(1).max(8),
}).strict();
export type LaunchStrategy = z.infer<typeof launchSchema>;

export function createLaunchStrategy(): LaunchStrategy {
  return { version: 1, targetMarginPct: 30, marginBasis: "payment", feeMode: "assumed-total", feePct: 15, projectFeeKrw: 0,
    adBudgetKrw: 0, eventRecipients: 0, eventCredits: 0, policy: "image-v2",
    plans: [
      { id: "basic", name: "베이직", type: "subscription", priceKrw: 100000, baseCredits: 100, bonusPct: 15, buyers: 50, reserveMonths: 1 },
      { id: "premium", name: "프리미엄", type: "subscription", priceKrw: 200000, baseCredits: 200, bonusPct: 15, buyers: 30, reserveMonths: 1 },
      { id: "credits", name: "크레딧 · 비교용 10만원", type: "purchase", priceKrw: 100000, baseCredits: 100, bonusPct: 15, buyers: 20, reserveMonths: 3 },
    ] };
}

/** Price proposal only. It does not change customer billing or redemption. */
export function recommendedLaunchStrategy(): LaunchStrategy {
  return { ...createLaunchStrategy(), plans: [
    { id: "starter", name: "스타터", type: "subscription", priceKrw: 29000, baseCredits: 20, bonusPct: 0, buyers: 35, reserveMonths: 1 },
    { id: "standard", name: "스탠다드", type: "subscription", priceKrw: 69000, baseCredits: 50, bonusPct: 0, buyers: 35, reserveMonths: 1 },
    { id: "pro", name: "프로", type: "subscription", priceKrw: 149000, baseCredits: 110, bonusPct: 0, buyers: 20, reserveMonths: 1 },
    { id: "credits", name: "구매 크레딧", type: "purchase", priceKrw: 39000, baseCredits: 20, bonusPct: 15, buyers: 10, reserveMonths: 3 },
  ] };
}

export function validateLaunchStrategy(value: unknown): LaunchStrategy {
  const result = launchSchema.parse(value);
  if (new Set(result.plans.map(x => x.id)).size !== result.plans.length) throw new Error("상품 ID가 중복되었습니다.");
  return result;
}

/** A sales-budget comparison with full redemption, not an accounting statement or billing mutation. */
export function compareLaunchPlans(raw: unknown, input: Scenario) {
  const config = validateLaunchStrategy(raw), original = validateScenario(input), s = structuredClone(original);
  const buyers = config.plans.reduce((n, p) => n + p.buyers, 0);
  const group = s.groups[0]!;
  const works = group.workMix.filter(m => m.weight > 0).map(m => {
    const profile = { ...s.profiles.find(p => p.id === m.id)!, proposedCharge: null, proposedRequired: null };
    return { ...estimateWork(profile, s.catalog, config.policy), weight: m.weight };
  });
  const issued = (p: LaunchStrategy["plans"][number]) => Math.floor(p.baseCredits * (100 + p.bonusPct) / 100 + 1e-9);
  const multiplier = (1 + s.business.providerTaxPct / 100) * (1 + s.business.fxFeePct / 100);
  const redeem = (credits: number) => simulateMember(credits, credits, works);
  const event = redeem(config.eventCredits);
  const eventApiKrw = event.apiUsd * s.fx * multiplier * config.eventRecipients;
  const effectiveFee = config.feeMode === "official-cash" ? 16.5 : config.feePct;
  const projectFee = config.feeMode === "official-cash" ? 108900 : config.projectFeeKrw;
  const commonCash = config.adBudgetKrw + projectFee;
  // Compute hosting against the launched quantities rather than the old 100-credit example.
  s.source = "current"; s.business.policy = config.policy === "image-v2" ? "image-v2" : "current";
  s.business.basis = "subscription"; s.business.paymentPct = effectiveFee;
  s.months = Math.max(...config.plans.map(p => p.reserveMonths)); s.selectedMonth = 1;
  s.teams = [];
  s.groups = config.plans.map(p => ({ ...structuredClone(group), id: p.id, label: p.name, members: p.buyers, growthPct: 0, monthlyMembers: null,
    quota: issued(p), creditPerPurchase: false, activePct: 100, utilPct: 100, grant: p.type === "subscription" ? "monthly" : "once", priceKrw: p.priceKrw, purchases: 1, team: null }));
  if (config.eventRecipients > 0 && config.eventCredits > 0) s.groups.push({ ...structuredClone(group), id: "launch-event", label: "모집 이벤트", members: config.eventRecipients,
    growthPct: 0, monthlyMembers: null, quota: config.eventCredits, activePct: 100, utilPct: 100, grant: "once", priceKrw: 0, purchases: 1, team: null, freeAnalyses: 0 });
  const months = forecast(s);
  const sharedPerBuyer = months.map(row => {
    if (!buyers || row.completeness !== "complete" || row.normalCostKrw === null || row.serviceability === "quota-exceeded") return null;
    // Normal cost excludes temporary AWS credits, protecting the target after credits expire.
    return Math.max(0, row.normalCostKrw - row.apiUsd * s.fx * multiplier) / buyers;
  });
  const results = config.plans.map(p => {
    const credits = issued(p), usage = redeem(credits), net = p.priceKrw / (1 + s.business.vatPct / 100);
    const fee = p.priceKrw * effectiveFee / 100;
    const requiredMonths = sharedPerBuyer.slice(0, p.reserveMonths);
    const infraReserve = requiredMonths.some(x => x === null) ? null : requiredMonths.reduce<number>((sum, x) => sum + x!, 0);
    const eventPerSale = buyers > 0 ? (eventApiKrw + commonCash) / buyers : null;
    const analyses = group.analysisUsd === null && group.freeAnalyses > 0 ? null : group.freeAnalyses * (group.analysisUsd ?? 0) * s.fx * multiplier * p.reserveMonths;
    const apiKrw = usage.apiUsd * s.fx * multiplier;
    const marginDenominator = config.marginBasis === "payment" ? p.priceKrw : net;
    const operatingBudget = net - marginDenominator * config.targetMarginPct / 100 - fee;
    const known = apiKrw + (infraReserve ?? 0) + (eventPerSale ?? 0) + (analyses ?? 0);
    const complete = infraReserve !== null && eventPerSale !== null && analyses !== null;
    const cost = complete ? known : null, profit = cost === null ? null : net - fee - cost;
    const margin = profit === null ? null : profit / marginDenominator * 100;
    const apiBudget = complete ? operatingBudget - infraReserve! - eventPerSale! - analyses! : null;
    // Evaluate complete allowance semantics, including minimum reservation and whole jobs.
    let maxCredits: number | null = null;
    if (apiBudget !== null && apiBudget >= 0) {
      let low = 0, high = 100000;
      for (let i = 0; i < 18 && low < high; i++) {
        const mid = Math.ceil((low + high) / 2), candidate = redeem(mid).apiUsd * s.fx * multiplier;
        if (candidate <= apiBudget + 1e-8) low = mid; else high = mid - 1;
      }
      maxCredits = low;
    }
    return { ...p, issuedCredits: credits, images: usage.images, apiKrw, netSalesKrw: net, channelFeeKrw: fee, infraReserveKrw: infraReserve,
      eventPerSaleKrw: eventPerSale, analysisKrw: analyses, operatingBudgetKrw: operatingBudget, totalCostKrw: cost, knownCostKrw: known,
      profitKrw: profit, marginPct: margin, meetsTarget: margin === null ? null : margin + 1e-8 >= config.targetMarginPct,
      creditUnitPriceKrw: p.priceKrw / credits, maxCredits, maxCreditsCapped: maxCredits === 100000 };
  });
  return { config, buyers, effectiveFeePct: effectiveFee, projectFeeKrw: projectFee, eventApiKrw, eventImages: event.images * config.eventRecipients,
    results, warnings: [
      "입력한 작업 구성·재시도·실패 가정에서 전량 소진할 때의 판매건별 예산입니다. 모든 모델/기능의 최악 비용을 보장하지 않습니다.",
      "월 구독은 1회 월 제공분, 구매형은 설정한 기간의 운영비를 적립하는 비교입니다. 미사용 잔액을 이익으로 잡는 회계표가 아닙니다.",
      "구매형 운영비 적립 기간과 실제 크레딧 유효기간은 별개입니다. 현재 새 구매 크레딧 코드의 유효기간은 3개월입니다.",
      "무료 제공 크레딧·광고비는 한 번 발생하는 모집 이벤트로 계산합니다. 반복 이벤트는 예산을 늘려야 합니다.",
      "공식 수수료 비교는 국내 기본 조건·컨설팅 제외, 수수료 VAT를 현금 지출로 포함합니다. 매입세액 처리와 실제 계약은 별도 확인 대상입니다.",
    ] };
}
