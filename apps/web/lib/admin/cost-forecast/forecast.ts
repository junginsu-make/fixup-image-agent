import { validateScenario, type Scenario, type MemberGroup } from "./schema";
import { estimateWork, type WorkEstimate } from "./work-profiles";
import { addUsage, emptyUsage, simulateMember, type Usage } from "./usage";
import { advanceDatabase, advanceInventory, daysInMonth, monthDate, sumKnown, type InventoryState } from "./inventory";
import { transferUsage, awsTransferCost } from "./transfer";
import { quoteAws, quoteSupabase, type InfraLine } from "./infrastructure";
import { recommendCapacity, type Recommendation } from "./sizing";

export interface MonthForecast {
  month: string; index: number; registered: number; active: number; newMembers: number;
  jobs: number; images: number; providerOutputs: number; chargedCredits: number;
  apiUsd: number; storageEndGB: number | null; storageAverageGB: number | null; storageGBHours: number | null;
  dbUsedGB: number | null; dbDiskGB: number | null; cachedGB: number | null; uncachedGB: number | null; awsGB: number | null;
  awsType: string | null; supabasePlan: string; supabaseCompute: string;
  awsUsd: number | null; supabaseUsd: number | null; supabaseAccountUsd: number | null; infraGrossUsd: number | null;
  benefitUsd: number; awsCreditRemaining: number | null;
  totalKrw: number | null; normalCostKrw: number | null; cumulativeKrw: number | null; knownCostKrw: number;
  grossSalesKrw: number; netSalesKrw: number; paymentFeeKrw: number; profitKrw: number | null; marginPct: number | null;
  walletUnspentKrw: number; costPerMemberKrw: number | null; costPerImageKrw: number | null;
  completeness: "complete" | "partial"; serviceability: "within-entered-limits" | "quota-exceeded" | "unknown";
  recommendation: Recommendation; transitions: string[]; warnings: string[];
  costLines: InfraLine[]; workCounts: Record<string, number>; groupImages: Record<string, number>;
  allowance: Array<{ id: string; label: string; images: number; credits: number; jobs: number }>;
}
type Cohort = { count: number; balance: number; expiresMonth?: number };
const scale = (v: number, places = 6) => Number(v.toFixed(places));

function resizeCohorts(cohorts: Cohort[], count: number, initial: number, expiresMonth?: number): Cohort[] {
  const current = cohorts.reduce((n, c) => n + c.count, 0);
  if (count > current) return [...cohorts, { count: count - current, balance: initial, expiresMonth }];
  let remaining = count;
  return cohorts.flatMap(c => { const take = Math.min(remaining, c.count); remaining -= take; return take ? [{ ...c, count: take }] : []; });
}
function mergeCohorts(cohorts: Cohort[]) {
  const balances = new Map<string, Cohort>();
  for (const c of cohorts) if (c.count > 0) { const balance = scale(Math.max(0, c.balance)), key = `${balance}/${c.expiresMonth ?? "none"}`; const old = balances.get(key); balances.set(key, { balance, count: (old?.count ?? 0) + c.count, expiresMonth: c.expiresMonth }); }
  return [...balances.values()];
}
function worksForGroup(s: Scenario, group: MemberGroup): WorkEstimate[] {
  return group.workMix.filter(m => m.weight > 0).map(m => {
    const p = structuredClone(s.profiles.find(x => x.id === m.id)!);
    if (s.business.policy !== "proposed") { p.proposedCharge = null; p.proposedRequired = null; }
    const w = estimateWork(p, s.catalog, s.business.policy === "image-v2" ? "image-v2" : "cost-v1"); w.weight = m.weight;
    if (s.business.basis === "wallet" && group.priceKrw > 0) {
      const denominator = (1 - s.business.walletMarginPct / 100) / (1 + s.business.vatPct / 100) - s.business.paymentPct / 100;
      if (denominator <= 0) throw new Error("충전형 목표 마진과 결제 수수료로 단가를 계산할 수 없습니다.");
      const charge = Math.ceil(w.apiUsd * s.fx / denominator * 100) / 100;
      w.charged = charge; w.required = charge; w.steps = [{ charged: charge, reserved: charge }];
    }
    return w;
  });
}

export function forecast(input: unknown): MonthForecast[] {
  const s = validateScenario(input);
  const groups = s.groups.map(g => ({ group: g, works: worksForGroup(s, g) }));
  const cohorts = new Map<string, Cohort[]>();
  const inventory: InventoryState = { initialGB: s.storage.initialGB, cohorts: [] };
  const benefit = { credit: s.aws.creditUsd };
  let dbUsed = s.database.initialGB, disk = s.database.diskGB;
  let previousMembers = groups.reduce((n, g) => n + g.group.members, 0);
  let pro = s.supabase.plan === "pro", compute = s.supabase.compute, awsType = s.aws.type;
  let cumulative: number | null = 0, previousPlan = s.supabase.plan as string, previousType = awsType;
  let previousBenefit = s.aws.creditUsd, withdrawnWallet = 0;
  const rows: MonthForecast[] = [], cache = new Map<string, Usage>();
  const simulate = (g: string, q: number, b: number, works: WorkEstimate[]) => {
    const key = `${g}/${scale(q)}/${scale(b)}`;
    let result = cache.get(key); if (!result) { result = simulateMember(q, b, works); cache.set(key, result); }
    return result;
  };
  for (let index = 0; index < s.months; index++) {
    const date = monthDate(s.startMonth, index), days = daysInMonth(date), hours = days * 24;
    const all = emptyUsage(), groupImages: Record<string, number> = {}, warnings: string[] = [], transitions: string[] = [];
    const teamLeft = new Map(s.teams.map(t => [t.id, t.monthlyQuota]));
    let registered = 0, active = 0, sales = 0, recognizedWallet = 0, payingMembers = 0, walletRemaining = withdrawnWallet, missingAnalysis = false;
    const allowance: MonthForecast["allowance"] = [];
    for (const { group: g, works } of groups) {
      const explicit = g.monthlyMembers;
      const members = explicit?.length
        ? explicit[index] ?? Math.floor(explicit[explicit.length - 1]! * Math.pow(1 + g.growthPct / 100, index - explicit.length + 1))
        : Math.floor(g.members * Math.pow(1 + g.growthPct / 100, index));
      if (!Number.isFinite(members) || members > 1e6) throw new Error(`${g.label}: ${index + 1}개월차 회원 수가 계산 범위 100만 명을 넘습니다. 기간/증가율을 조정하세요.`);
      const activeCount = Math.floor(members * g.activePct / 100);
      const paying = s.business.basis !== "free" && g.priceKrw > 0;
      const wallet = s.business.basis === "wallet" && paying;
      const grant = wallet ? g.priceKrw * g.purchases : g.quota * (g.creditPerPurchase ? g.purchases : 1);
      registered += members; active += activeCount; if (paying) payingMembers += members;
      let previous = cohorts.get(g.id) ?? [];
      const firstPurchasers = Math.max(0, members - previous.reduce((n, c) => n + c.count, 0));
      if (paying) sales += (g.grant === "purchase" && !wallet ? firstPurchasers : members) * g.priceKrw * g.purchases;
      if (wallet) {
        const before = previous.reduce((n, c) => n + c.count * c.balance, 0);
        previous = resizeCohorts(previous, members, index === 0 ? s.business.walletInitialBalance : 0);
        const after = previous.reduce((n, c) => n + c.count * c.balance, 0);
        if (before > after) { withdrawnWallet += before - after; walletRemaining += before - after; }
        previous = previous.map(c => ({ ...c, balance: c.balance + grant }));
      } else if (g.grant === "monthly") previous = [{ count: members, balance: grant }];
      else {
        previous = previous.map(c => c.expiresMonth !== undefined && index >= c.expiresMonth ? { ...c, balance: 0 } : c);
        previous = resizeCohorts(previous, members, grant, g.grant === "purchase" ? index + 3 : undefined);
      }
      const next: Cohort[] = []; const total = emptyUsage();
      let distributedActive = 0, peopleBefore = 0;
      for (const cohort of previous) {
        peopleBefore += cohort.count;
        const activeHere = Math.floor(peopleBefore * g.activePct / 100) - distributedActive; distributedActive += activeHere;
        next.push({ count: cohort.count - activeHere, balance: cohort.balance, expiresMonth: cohort.expiresMonth });
        const budget = wallet ? scale(cohort.balance * g.utilPct / 100) : Math.floor(cohort.balance * g.utilPct / 100);
        const per = simulate(g.id, cohort.balance, budget, works);
        const pool = g.team ? teamLeft.get(g.team)! : Infinity;
        const full = per.credits > 0 ? Math.max(0, Math.min(activeHere, Math.floor((pool - per.requiredStart + 1e-8) / per.credits) + 1)) : activeHere;
        addUsage(total, per, full); next.push({ count: full, balance: cohort.balance - per.credits, expiresMonth: cohort.expiresMonth });
        let left = Math.max(0, pool - per.credits * full), remaining = activeHere - full;
        if (remaining > 0 && left > 0) {
          const partial = simulate(g.id, Math.min(cohort.balance, left), Math.min(budget, left), works);
          addUsage(total, partial); next.push({ count: 1, balance: cohort.balance - partial.credits, expiresMonth: cohort.expiresMonth });
          left -= partial.credits; remaining--;
        }
        if (remaining) { next.push({ count: remaining, balance: cohort.balance, expiresMonth: cohort.expiresMonth }); warnings.push(`${g.label}: 팀 한도로 일부 수요를 실행하지 못합니다.`); }
        if (g.team) teamLeft.set(g.team, left);
      }
      if (g.freeAnalyses > 0 && activeCount > 0) {
        if (g.analysisUsd === null) missingAnalysis = true;
        else total.apiUsd += activeCount * g.freeAnalyses * g.analysisUsd;
      }
      if (wallet) recognizedWallet += total.credits;
      const merged = mergeCohorts(next); cohorts.set(g.id, merged);
      if (wallet) walletRemaining += merged.reduce((n, c) => n + c.count * c.balance, 0);
      addUsage(all, total); groupImages[g.id] = total.images;
      for (const w of works) warnings.push(...w.warnings);
      const fullAllowance = simulate(g.id, grant, grant, works);
      allowance.push({ id: g.id, label: g.label, images: fullAllowance.images, credits: fullAllowance.credits, jobs: fullAllowance.jobs });
    }
    const newMembers = Math.max(0, registered - previousMembers); previousMembers = registered;
    const stock = advanceInventory(inventory, all, s.storage, date, index, active);
    dbUsed = advanceDatabase(dbUsed, newMembers, all, s.database);
    if (s.database.autoGrowDisk && dbUsed !== null && disk !== null) disk = Math.max(disk, Math.ceil(dbUsed / Math.max(.01, 1 - s.database.headroomPct / 100)));
    const uploadGB = sumKnown(all.uploadMB === null ? null : all.uploadMB / 1000, s.storage.additionalUploadGB,
      s.storage.uploadPerActiveMB === null ? null : s.storage.uploadPerActiveMB * active / 1000, s.storage.orphanGBMonthly,
      s.storage.events.filter(e => e.date.startsWith(date.toISOString().slice(0, 7))).reduce((n, e) => n + e.addGB, 0));
    const transfer = transferUsage(all, stock.averageGB, uploadGB, s.transfers);
    const capacity = structuredClone(s.capacity);
    const profileMatches = s.profiles.length === 1 && capacity.profileId === s.profiles[0]!.id && capacity.profileSignature === JSON.stringify(s.profiles[0]);
    if (!profileMatches) capacity.mode = "assumed";
    const recommendation = recommendCapacity(capacity, active, all.images, s.aws, s.catalog);
    if (s.aws.selection === "recommended") {
      const candidate = s.catalog.ec2.find(x => x.id === recommendation.ec2Type);
      const previous = s.catalog.ec2.find(x => x.id === awsType);
      if (candidate && (!previous || candidate.ram >= previous.ram)) awsType = candidate.id;
      if (!candidate) warnings.push("추천 후보가 없어 현재 설정을 유지합니다. 부하를 수용한다고 확정할 수 없습니다.");
    }
    const scheduledAws = s.aws.schedule.find(x => x.month === index + 1); if (scheduledAws) awsType = scheduledAws.type;
    const scheduledDb = s.supabase.schedule.find(x => x.month === index + 1);
    let plan = pro ? "pro" as const : s.supabase.plan;
    if (scheduledDb) { plan = scheduledDb.plan; pro = plan === "pro"; compute = scheduledDb.compute; }
    const dbUsage = { storageAverageGB: stock.averageGB, dbUsedGB: dbUsed, cachedGB: transfer.cachedGB, uncachedGB: transfer.uncachedGB, mau: active, diskGB: disk };
    let sb = quoteSupabase({ ...s.supabase, plan, compute }, dbUsage, hours, s.catalog);
    if (plan === "free" && sb.quotaExceeded && s.supabase.transition === "upgrade") {
      plan = "pro"; pro = true;
      sb = quoteSupabase({ ...s.supabase, plan, compute }, dbUsage, hours, s.catalog);
      transitions.push("무료 포함량 초과 → 해당 월 초 Pro 전환 가정");
    }
    if (plan !== previousPlan && !transitions.length) transitions.push(`Supabase ${previousPlan} → ${plan}`);
    if (awsType !== previousType && awsType) transitions.push(`EC2 ${previousType ?? "미설정"} → ${awsType} 가정`);
    previousPlan = plan; previousType = awsType;
    const aws = quoteAws({ ...s.aws, type: awsType }, date, days, awsTransferCost(transfer.awsGB, s.transfers), benefit, s.catalog);
    if ((previousBenefit ?? 0) > 0 && aws.creditRemaining === 0) transitions.push("AWS 무료 크레딧 소진/만료");
    previousBenefit = aws.creditRemaining;
    if (sb.quotaExceeded) warnings.push(`요금제/지출 상한 검토: ${sb.requirements.join(", ")}`);
    if (aws.stopped) warnings.push("무료 혜택 종료 후 유료 지속을 선택하지 않았습니다.");
    if (s.aws.cpuSurplusUsd === null) warnings.push("CPU 초과 크레딧 비용 미입력");
    if (s.aws.benefit === "unknown") warnings.push("AWS 무료 혜택 미확인");
    const allocatedDiskTooSmall = dbUsed !== null && disk !== null && dbUsed > disk;
    if (allocatedDiskTooSmall) warnings.push("DB 실제 데이터 예상량이 할당 디스크보다 큽니다.");
    const quotaExceeded = sb.quotaExceeded || aws.stopped || allocatedDiskTooSmall;
    const infraGrossUsd = sumKnown(aws.grossUsd, sb.usd);
    const infraUsd = sumKnown(aws.usd, sb.usd);
    const multiplier = (1 + s.business.providerTaxPct / 100) * (1 + s.business.fxFeePct / 100);
    const apiKrw = missingAnalysis ? null : all.apiUsd * s.fx * multiplier;
    const extra = s.business.otherFixedKrw + payingMembers * s.business.supportPerPayingKrw;
    const manual = s.business.infraMode === "manual-total";
    const effectiveInfra = manual ? s.business.manualInfraKrw : infraUsd === null || sb.unknown ? null : infraUsd * s.fx * multiplier;
    const total = sumKnown(apiKrw, effectiveInfra, extra);
    const normal = sumKnown(apiKrw, manual ? s.business.manualInfraKrw : infraGrossUsd === null ? null : infraGrossUsd * s.fx * multiplier, extra);
    const knownInfra = manual ? s.business.manualInfraKrw ?? 0 : (aws.knownUsd + sb.knownUsd) * s.fx * multiplier;
    const knownCost = all.apiUsd * s.fx * multiplier + knownInfra + extra;
    const serviceability = quotaExceeded ? "quota-exceeded" : sb.unknown || stock.endGB === null || dbUsed === null ? "unknown" : "within-entered-limits";
    const complete = total !== null && !missingAnalysis;
    const net = (s.business.basis === "wallet" ? recognizedWallet : sales) / (1 + s.business.vatPct / 100);
    const pg = sales * s.business.paymentPct / 100;
    const profit = complete && serviceability !== "quota-exceeded" ? net - pg - total! : null;
    cumulative = sumKnown(cumulative, quotaExceeded ? null : total);
    if (s.business.basis === "wallet") warnings.push("미사용 충전금은 이익에 포함하지 않습니다. 환불·선수금 회계는 별도입니다.");
    if (s.groups.some(g => g.grant === "purchase")) warnings.push("구매 크레딧은 가입/구매 월초 지급·3개월 후 소멸하는 코호트 가정입니다. 구매 매출은 판매 월에 반영하는 현금 예산이며 실제 회계/환불과 구분합니다.");
    rows.push({ month: date.toISOString().slice(0, 7), index: index + 1, registered, active, newMembers,
      jobs: all.jobs, images: all.images, providerOutputs: all.providerOutputs, chargedCredits: all.credits, apiUsd: all.apiUsd,
      storageEndGB: stock.endGB, storageAverageGB: stock.averageGB, storageGBHours: stock.gbHours, dbUsedGB: dbUsed, dbDiskGB: disk, ...transfer,
      awsType, supabasePlan: plan, supabaseCompute: compute, awsUsd: aws.usd, supabaseUsd: sb.usd, supabaseAccountUsd: sb.accountUsd, infraGrossUsd,
      benefitUsd: aws.benefitUsd, awsCreditRemaining: aws.creditRemaining, totalKrw: total, normalCostKrw: normal, cumulativeKrw: cumulative, knownCostKrw: knownCost,
      grossSalesKrw: sales, netSalesKrw: net, paymentFeeKrw: pg, profitKrw: profit, marginPct: net > 0 && profit !== null ? profit / net * 100 : null,
      walletUnspentKrw: walletRemaining, costPerMemberKrw: registered > 0 && complete ? total! / registered : null, costPerImageKrw: all.images > 0 && complete ? total! / all.images : null,
      completeness: complete ? "complete" : "partial", serviceability, recommendation, transitions, warnings: [...new Set(warnings)],
      costLines: [{ id: "api", label: "AI API 예상", grossUsd: missingAnalysis ? null : all.apiUsd, benefitUsd: 0, payableUsd: missingAnalysis ? null : all.apiUsd }, ...aws.lines.map(l => ({ ...l, id: `aws-${l.id}` })), ...sb.lines.map(l => ({ ...l, id: `supabase-${l.id}` }))],
      workCounts: all.byWork, groupImages, allowance,
    });
  }
  return rows;
}
