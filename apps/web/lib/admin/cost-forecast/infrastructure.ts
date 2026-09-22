import type { PriceCatalog } from "./catalog";
import type { AwsConfig, SupabaseConfig } from "./schema";
import { sumKnown } from "./inventory";

export interface InfraLine { id: string; label: string; grossUsd: number | null; benefitUsd: number; payableUsd: number | null; }
export interface SupabaseUsage { storageAverageGB: number | null; dbUsedGB: number | null; cachedGB: number | null; uncachedGB: number | null; mau: number | null; diskGB?: number | null; }
export function quoteSupabase(s: SupabaseConfig, u: SupabaseUsage, hours: number, c: PriceCatalog) {
  const p = c.supabase, isPro = s.plan === "pro";
  const storage = sumKnown(u.storageAverageGB, s.otherStorageGB), db = sumKnown(u.dbUsedGB, s.otherDatabaseGB);
  const mau = s.uniqueMau ?? sumKnown(u.mau, s.otherMau);
  const requirements: string[] = [];
  const check = (value: number | null, limit: number, label: string) => { if (value !== null && value > limit + 1e-10) requirements.push(label); };
  check(storage, isPro ? p.proStorageGB : p.freeStorageGB, "파일 저장 포함량");
  if (!isPro) check(db, p.freeDatabaseGB, "DB 데이터 한도");
  check(u.cachedGB, isPro ? p.proEgressGB : p.freeEgressGB, "캐시 전송 포함량");
  check(u.uncachedGB, isPro ? p.proEgressGB : p.freeEgressGB, "일반 전송 포함량");
  check(mau, isPro ? p.proMau : p.freeMau, "MAU 포함량");
  const unknownUsage = [storage, db, mau, u.cachedGB, u.uncachedGB].some(x => x === null);
  const line = (id: string, label: string, amount: number | null, benefit = 0): InfraLine => ({ id, label, grossUsd: amount, benefitUsd: benefit, payableUsd: amount === null ? null : amount - benefit });
  let lines: InfraLine[];
  if (s.plan === "unknown") lines = [line("plan", "Supabase 요금제 미확인", null)];
  else if (s.plan === "custom") lines = [line("custom", "Supabase 직접 입력", s.customMonthlyUsd)];
  else if (!isPro) lines = [line("free", "Supabase Free", 0)];
  else {
    const compute = sumKnown(c.compute[s.compute] === undefined ? null : c.compute[s.compute]! * hours, s.otherComputeUsd);
    const diskGB = u.diskGB === undefined ? 8 : u.diskGB;
    const over = (value: number | null, included: number, rate: number) => value === null ? null : Math.max(0, value - included) * rate;
    lines = [line("plan", "Pro 조직 기본료", p.pro), line("compute", "DB compute · 조직 credit 1회", compute, compute === null ? 0 : Math.min(p.computeCredit, compute)),
      line("storage", "이미지 파일 저장 초과", over(storage, p.proStorageGB, hours * p.storageGBHour)),
      line("disk", "DB 할당 디스크 초과", sumKnown(over(diskGB, p.proDiskGB, hours * p.diskGBHour), s.otherDiskUsd)),
      line("cached", "캐시 전송 초과", over(u.cachedGB, p.proEgressGB, p.cachedGB)), line("uncached", "일반 전송 초과", over(u.uncachedGB, p.proEgressGB, p.uncachedGB)),
      line("mau", "MAU 초과", over(mau, p.proMau, p.mau)), line("addons", "Supabase 추가 서비스", s.addonsUsd)];
    if (s.spendCap && diskGB !== null && diskGB > p.proDiskGB) requirements.push("DB 디스크 포함량");
  }
  const total = sumKnown(...lines.map(l => l.payableUsd));
  const limited = s.plan === "free" || (s.plan === "pro" && s.spendCap);
  return { usd: total === null ? null : total * s.sharePct / 100, accountUsd: total, knownUsd: lines.reduce((n, l) => n + (l.payableUsd ?? 0), 0) * s.sharePct / 100, lines,
    quotaExceeded: limited && requirements.length > 0, requirements, unknown: unknownUsage || s.plan === "unknown" };
}

export interface AwsBenefitState { credit: number | null; }
export function quoteAws(a: AwsConfig, start: Date, days: number, transferUsd: number | null, state: AwsBenefitState, c: PriceCatalog) {
  const hours = days * 24;
  const rate = a.type === "custom" ? a.hourlyUsd : a.region === "ap-northeast-2" ? c.ec2.find(x => x.id === a.type)?.hourly ?? null : a.hourlyUsd;
  const compute = a.monthlyUsd !== null && a.type === "custom" ? a.monthlyUsd : rate === null ? null : rate * hours * a.count;
  const product = (x: number | null, y: number | null) => x === 0 || y === 0 ? 0 : x === null || y === null ? null : x * y;
  const gross: Record<string, number | null> = { compute, disk: product(a.ebsGB, a.ebsPerGB), ip: product(a.ipv4Count, a.ipv4HourlyUsd) === null ? null : product(a.ipv4Count, a.ipv4HourlyUsd)! * hours,
    transfer: transferUsd, cpu: a.cpuSurplusUsd, other: a.otherMonthlyUsd };
  const labels: Record<string, string> = { compute: "EC2 실행", disk: "EBS 디스크", ip: "공인 IPv4", transfer: "AWS 전송", cpu: "CPU 초과 크레딧", other: "AWS 기타" };
  const lines = Object.entries(gross).map(([id, usd]) => ({ id, label: labels[id]!, grossUsd: usd, benefitUsd: 0, payableUsd: usd }));
  let validDays = days;
  if (a.expiresOn) validDays = Math.max(0, Math.min(days, Math.round((Date.parse(a.expiresOn + "T00:00:00Z") - start.getTime()) / 86400000)));
  let unknownBenefit = a.benefit === "unknown";
  if (a.benefit === "credit") {
    if (state.credit === null || a.expiresOn === null) unknownBenefit = true;
    else {
      // Spend eligible items uniformly by day, then other account usage, at most the remaining credit.
      for (let day = 0; day < validDays; day++) {
        for (const line of lines) if (a.creditEligible.includes(line.id as AwsConfig["creditEligible"][number])) {
          if (line.grossUsd === null) { unknownBenefit = true; continue; }
          const credit = Math.min(state.credit!, line.grossUsd / days); state.credit! -= credit; line.benefitUsd += credit;
        }
        state.credit = Math.max(0, state.credit! - a.otherCreditUseUsd / days);
      }
      if (validDays < days) state.credit = 0;
    }
  } else if (a.benefit === "legacy") {
    if (a.expiresOn === null || a.legacyHours === null || rate === null) unknownBenefit = true;
    else lines[0]!.benefitUsd = Math.min(compute ?? 0, Math.min(a.legacyHours, validDays * 24 * a.count) * rate);
  }
  for (const line of lines) line.payableUsd = line.grossUsd === null ? null : Math.max(0, line.grossUsd - line.benefitUsd);
  const known = lines.reduce((n, l) => n + (l.payableUsd ?? 0), 0);
  const grossUsd = sumKnown(...lines.map(l => l.grossUsd));
  return { usd: unknownBenefit ? null : sumKnown(...lines.map(l => l.payableUsd)), grossUsd, knownUsd: known, lines,
    benefitUsd: lines.reduce((n, l) => n + l.benefitUsd, 0), creditRemaining: state.credit,
    stopped: !a.continuePaid && a.benefit !== "none" && (validDays < days || (a.benefit === "credit" && state.credit === 0)), unknownBenefit };
}
