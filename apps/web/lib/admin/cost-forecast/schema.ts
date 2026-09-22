import { z } from "zod";
import { CURRENT_CATALOG, type PriceCatalog } from "./catalog";

const num = (max = 1e9, min = 0) => z.number().finite().min(min).max(max);
const nullable = (max = 1e9) => num(max).nullable();
const pct = num(100);
const id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/).refine(s => !["__proto__", "constructor", "prototype"].includes(s));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "날짜를 확인하세요");
const month = z.string().regex(/^\d{4}-\d{2}$/).refine(s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s), "월을 확인하세요");
const url = z.string().max(2000).refine(s => /^https?:\/\//i.test(s), "출처는 http/https만 허용합니다");
const evidence = z.object({ kind: z.enum(["official", "code", "observed", "assumed", "unknown"]), source: z.string().max(2000).refine(s => !/^\s*(javascript|data|vbscript):/i.test(s)), checkedAt: date.nullable(), note: z.string().max(2000).optional() });

export const workSchema = z.object({
  id, label: z.string().max(100), kind: z.enum(["poster", "sns", "pdp", "character", "character-angle", "redesign", "redesign-edit", "custom"]),
  model: id, ratio: z.string().max(50), width: num(16000, 1).int(), height: num(16000, 1).int(),
  mode: z.enum(["t2i", "i2i"]), images: num(100, 1).int(), plans: num(100).int(), visionReads: num(100).int(),
  successCount: num(1000, 1).int().nullable(), billableCount: num(1000).nullable(),
  candidates: num(3, 1).int(), angles: num(6).int(), sheet: z.boolean(), slotsPerCard: num(12, 1).int(),
  placedCards: num(100).int(), slotScale: num(1, .01), regenerations: num(100).int(),
  savePct: pct, storageMode: z.enum(["append", "overwrite", "browser-only"]),
  originalMB: nullable(1000), previewMB: nullable(100), replacedMB: nullable(1000), responseFactor: nullable(10),
  unitOverrideUsd: nullable(1000), textOverrideUsd: nullable(1000),
  proposedCharge: nullable(1e8), proposedRequired: nullable(1e8),
  serviceRetryPct: num(200), failurePct: num(95), failureCostPct: pct, failedFilePct: pct, extraSavePct: pct,
}).strict();
export type WorkProfile = z.infer<typeof workSchema>;

const groupSchema = z.object({
  id, label: z.string().max(100), members: num(1e6).int(), growthPct: num(1000, -100),
  monthlyMembers: z.array(num(1e6).int()).max(36).nullable(), activePct: pct, utilPct: pct,
  quota: num(1e6), creditPerPurchase: z.boolean(), grant: z.enum(["monthly", "once", "purchase"]), priceKrw: num(1e7), purchases: num(1000),
  workMix: z.array(z.object({ id, weight: num(1000) })).min(1).max(20),
  team: id.nullable(), freeAnalyses: num(1000), analysisUsd: nullable(100),
}).strict();
export type MemberGroup = z.infer<typeof groupSchema>;

const catalogSchema = z.object({
  version: z.string().max(100), checkedAt: date,
  models: z.array(z.object({ id, label: z.string().max(100), maxReferenceImages: num(100).int(), batchMax: num(100, 1).int(), t2i: z.object({ endpoint: z.string().max(300), flatUsd: num(1000).optional(), table: z.array(z.object({ width: num(16000, 1), height: num(16000, 1), usd: num(1000) })).min(1).max(100).optional() }).passthrough(), i2i: z.object({ endpoint: z.string().max(300), flatUsd: num(1000).optional(), table: z.array(z.object({ width: num(16000, 1), height: num(16000, 1), usd: num(1000) })).min(1).max(100).optional() }).passthrough(), resolutionMultiplier: num(100, .01).optional() }).passthrough()).min(1).max(40),
  flat: z.record(z.string(), num(1000)), pdpBatch: z.record(z.string(), num(100, 1).int()),
  creditUsd: num(100, .000001), planUsd: num(100), visionUsd: num(100),
  ec2: z.array(z.object({ id, ram: num(2048, .01), cpu: num(512, 1), hourly: num(1000) })).max(30),
  compute: z.record(z.string(), num(1000)),
  supabase: z.object({ pro: num(), computeCredit: num(), storageGBHour: num(), diskGBHour: num(), cachedGB: num(), uncachedGB: num(), mau: num(), freeStorageGB: num(), proStorageGB: num(), freeEgressGB: num(), proEgressGB: num(), freeDatabaseGB: num(), proDiskGB: num(), freeMau: num(), proMau: num() }),
  sources: z.array(z.object({ label: z.string().max(100), url })).max(30),
});

export const scenarioSchema = z.object({
  version: z.literal(1), source: z.enum(["current", "main", "wallet"]), example: z.boolean(), startMonth: month, months: num(36, 1).int(), selectedMonth: num(36, 1).int(),
  fx: num(100000, .01), groups: z.array(groupSchema).min(1).max(20), profiles: z.array(workSchema).min(1).max(20),
  teams: z.array(z.object({ id, monthlyQuota: num(1e8) })).max(20),
  storage: z.object({ initialGB: nullable(), retentionMonths: num(36, 1).int().nullable(), additionalUploadGB: nullable(), uploadPerActiveMB: nullable(),
    initialDeleteMonth: num(36, 1).int().nullable(), orphanGBMonthly: nullable(), events: z.array(z.object({ date, addGB: num(), deleteGB: num() })).max(100) }).strict(),
  database: z.object({ initialGB: nullable(), perNewMemberKB: nullable(), perJobKB: nullable(), logGBMonthly: nullable(), cleanupGBMonthly: nullable(), diskGB: nullable(), headroomPct: pct, autoGrowDisk: z.boolean() }).strict(),
  transfers: z.object({ viewsPerImage: nullable(10000), downloadsPerImage: nullable(10000), browserCachePct: pct, cdnCachePct: pct, proxyPct: pct,
    referenceMBPerOutput: nullable(1000), generationResponseFactor: num(10), uploadAwsPct: pct,
    otherCachedGB: nullable(), otherUncachedGB: nullable(), otherAwsGB: nullable(), awsFreeGB: nullable(), awsPerGB: nullable(100),
    awsTiers: z.array(z.object({ upToGB: num(), usdPerGB: num(100) })).max(10) }).strict(),
  aws: z.object({ region: z.string().max(100), type: z.string().max(100).nullable(), currentType: z.string().max(100).nullable(), count: num(100, 1).int(),
    hourlyUsd: nullable(1000), monthlyUsd: nullable(), ebsGB: nullable(), ebsPerGB: nullable(100), ipv4Count: nullable(100), ipv4HourlyUsd: nullable(10), otherMonthlyUsd: nullable(),
    cpuSurplusUsd: nullable(), benefit: z.enum(["unknown", "none", "credit", "legacy"]), creditUsd: nullable(), expiresOn: date.nullable(), legacyHours: nullable(100000),
    creditEligible: z.array(z.enum(["compute", "disk", "ip", "transfer", "cpu", "other"])), otherCreditUseUsd: num(), continuePaid: z.boolean(),
    selection: z.enum(["manual", "recommended"]), schedule: z.array(z.object({ month: num(36, 1).int(), type: id })).max(100) }).strict(),
  supabase: z.object({ plan: z.enum(["unknown", "free", "pro", "custom"]), compute: z.string().max(100), spendCap: z.boolean(), transition: z.enum(["keep", "upgrade"]),
    otherComputeUsd: nullable(), otherStorageGB: nullable(), otherDatabaseGB: nullable(), otherDiskUsd: nullable(), otherMau: nullable(), uniqueMau: nullable(),
    sharePct: pct, customMonthlyUsd: nullable(), addonsUsd: nullable(), schedule: z.array(z.object({ month: num(36, 1).int(), plan: z.enum(["free", "pro", "custom"]), compute: id })).max(100) }).strict(),
  capacity: z.object({ peakJobs: nullable(1e6), peakPct: pct, baseRamGiB: nullable(1000), jobRamGiB: nullable(1000), maxRamPct: num(95, 1),
    mode: z.enum(["assumed", "measured"]), profileId: id.nullable(), profileSignature: z.string().max(5000).nullable(), measuredType: z.string().max(100).nullable(), measuredMaxJobs: nullable(1e6), measuredOn: date.nullable(),
    cpuSecondsPerJob: nullable(), peakJobsPerSecond: nullable(), maxCpuPct: num(100, 1), dbValidated: z.boolean() }).strict(),
  business: z.object({ basis: z.enum(["free", "subscription", "wallet"]), policy: z.enum(["current", "image-v2", "proposed"]), vatPct: pct, paymentPct: pct,
    infraMode: z.enum(["itemized", "manual-total"]), manualInfraKrw: nullable(), otherFixedKrw: num(), supportPerPayingKrw: num(),
    providerTaxPct: pct, fxFeePct: pct, walletMarginPct: num(95), walletInitialBalance: num(), }).strict(),
  evidence: z.record(z.string().max(150), evidence), catalog: catalogSchema,
}).strict();

export type Scenario = Omit<z.infer<typeof scenarioSchema>, "catalog"> & { catalog: PriceCatalog };
export type AwsConfig = Scenario["aws"];
export type SupabaseConfig = Scenario["supabase"];
export type CapacityConfig = Scenario["capacity"];

export function validateScenario(input: unknown): Scenario {
  const text = JSON.stringify(input);
  if (!text || new TextEncoder().encode(text).length > 262144) throw new Error("설정 파일은 256KB 이하여야 합니다.");
  const s = scenarioSchema.parse(input) as Scenario;
  for (const list of [s.groups, s.profiles, s.teams]) if (new Set(list.map(x => x.id)).size !== list.length) throw new Error("같은 ID가 중복되었습니다.");
  const ids = new Set(s.profiles.map(p => p.id));
  for (const group of s.groups) {
    if (!group.workMix.some(x => x.weight > 0) || group.workMix.some(x => !ids.has(x.id))) throw new Error("작업 비중과 작업 ID를 확인하세요.");
    if (new Set(group.workMix.map(x => x.id)).size !== group.workMix.length) throw new Error("작업 비중의 ID가 중복되었습니다.");
    if (group.team && !s.teams.some(t => t.id === group.team)) throw new Error("팀 한도 설정을 확인하세요.");
  }
  if (s.selectedMonth > s.months) throw new Error("선택 월은 예측 기간 안이어야 합니다.");
  if (s.business.basis === "wallet" && s.business.policy === "image-v2") throw new Error("원화 충전형과 이미지 크레딧은 단위가 다릅니다. 새 정책 비교는 월 정액/무료 기준을 선택하세요.");
  return s;
}

export function createScenario(example = false): Scenario {
  const now = new Date(); const startMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().slice(0, 7);
  const known = (n: number) => example ? n : null;
  return {
    version: 1, source: "current", example, startMonth, months: 12, selectedMonth: 1, fx: 1380,
    groups: [{ id: "members", label: "회원", members: 100, growthPct: 0, monthlyMembers: null, activePct: 70, utilPct: 80, quota: 100, creditPerPurchase: false, grant: "monthly", priceKrw: 0, purchases: 1, workMix: [{ id: "poster", weight: 100 }], team: null, freeAnalyses: 0, analysisUsd: 0 }],
    profiles: [{ id: "poster", label: "이미지 한 장", kind: "poster", model: "gpt-image-2.5-flare", ratio: "1:1", width: 1024, height: 1024, mode: "t2i", images: 1, plans: 0, visionReads: 0, successCount: null, billableCount: null, candidates: 1, angles: 3, sheet: false, slotsPerCard: 1, placedCards: 0, slotScale: 1, regenerations: 0, savePct: 100, storageMode: "append", originalMB: 2, previewMB: .05, replacedMB: null, responseFactor: null, unitOverrideUsd: null, textOverrideUsd: null, proposedCharge: null, proposedRequired: null, serviceRetryPct: 0, failurePct: 0, failureCostPct: 100, failedFilePct: 0, extraSavePct: 0 }],
    teams: [], storage: { initialGB: known(0), retentionMonths: null, additionalUploadGB: known(0), uploadPerActiveMB: known(0), initialDeleteMonth: null, orphanGBMonthly: known(0), events: [] },
    database: { initialGB: known(.05), perNewMemberKB: known(5), perJobKB: known(10), logGBMonthly: known(.01), cleanupGBMonthly: known(0), diskGB: known(8), headroomPct: 30, autoGrowDisk: false },
    transfers: { viewsPerImage: known(5), downloadsPerImage: known(1), browserCachePct: 50, cdnCachePct: 0, proxyPct: 100, referenceMBPerOutput: known(0), generationResponseFactor: 1, uploadAwsPct: 100, otherCachedGB: known(0), otherUncachedGB: known(0), otherAwsGB: known(0), awsFreeGB: known(0), awsPerGB: known(.126), awsTiers: [] },
    aws: { region: "ap-northeast-2", type: example ? "t3.micro" : null, currentType: null, count: 1, hourlyUsd: null, monthlyUsd: null,
      ebsGB: known(30), ebsPerGB: known(.0912), ipv4Count: known(1), ipv4HourlyUsd: known(.005), otherMonthlyUsd: known(0), cpuSurplusUsd: known(0),
      benefit: example ? "none" : "unknown", creditUsd: known(0), expiresOn: null, legacyHours: known(0), creditEligible: ["compute", "disk", "ip", "transfer", "cpu", "other"], otherCreditUseUsd: 0, continuePaid: true, selection: "manual", schedule: [] },
    supabase: { plan: example ? "free" : "unknown", compute: "micro", spendCap: false, transition: "upgrade", otherComputeUsd: known(0), otherStorageGB: known(0), otherDatabaseGB: known(0), otherDiskUsd: known(0), otherMau: known(0), uniqueMau: null, sharePct: 100, customMonthlyUsd: null, addonsUsd: known(0), schedule: [] },
    capacity: { peakJobs: null, peakPct: 3, baseRamGiB: 1, jobRamGiB: .25, maxRamPct: 70, mode: "assumed", profileId: null, profileSignature: null, measuredType: null, measuredMaxJobs: null, measuredOn: null, cpuSecondsPerJob: null, peakJobsPerSecond: null, maxCpuPct: 70, dbValidated: false },
    business: { basis: "subscription", policy: "current", vatPct: 10, paymentPct: 3.3, infraMode: "itemized", manualInfraKrw: null, otherFixedKrw: 0, supportPerPayingKrw: 0, providerTaxPct: 0, fxFeePct: 0, walletMarginPct: 50, walletInitialBalance: 0 },
    evidence: { defaults: { kind: "assumed", source: "초기 예시: 파일 크기·트래픽·부하·EBS/송신 단가는 직접 조정하는 가정", checkedAt: null } },
    catalog: structuredClone(CURRENT_CATALOG),
  };
}
