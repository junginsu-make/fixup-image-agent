import { describe, expect, it } from "vitest";
import { createScenario, validateScenario } from "../schema";
import { forecast } from "../forecast";
import { quoteAws, quoteSupabase } from "../infrastructure";
import { advanceInventory } from "../inventory";
import { emptyUsage } from "../usage";
import { awsTransferCost, transferUsage } from "../transfer";

describe("월 경계와 데이터 보관", () => {
  it("28/29/30/31일 모두 월말과 평균을 정확히 분리한다", () => {
    for (const [startMonth, hours] of [["2027-02", 672], ["2028-02", 696], ["2026-04", 720], ["2026-10", 744]] as const) {
      const s = createScenario(true); s.startMonth = startMonth;
      const r = forecast(s)[0]!;
      expect(r.storageGBHours).toBeCloseTo(r.storageAverageGB! * hours);
      expect(r.storageEndGB).toBeCloseTo(2.296);
    }
  });
  it("명시적 삭제는 오래된 파일을 지우며 새 파일의 보관 나이를 바꾸지 않는다", () => {
    const s = createScenario(true); s.storage.initialGB = 10; s.storage.retentionMonths = 1;
    s.storage.events = [{ date: "2026-10-15", addGB: 0, deleteGB: 5 }];
    const stock = { initialGB: 10, cohorts: [] as { month: number; gb: number | null }[] };
    const usage = { ...emptyUsage(), savedMB: 20000 };
    expect(advanceInventory(stock, usage, s.storage, new Date("2026-10-01Z"), 0, 0).endGB).toBeCloseTo(25);
    expect(stock.initialGB).toBe(5);
    expect(advanceInventory(stock, emptyUsage(), s.storage, new Date("2026-11-01Z"), 1, 0).endGB).toBeCloseTo(5);
  });
  it("탈퇴를 Storage 삭제로 오해하지 않는다", () => {
    const s = createScenario(true); s.groups[0]!.monthlyMembers = [100, 0];
    const rows = forecast(s); expect(rows[1]!.images).toBe(0); expect(rows[1]!.storageEndGB).toBeCloseTo(rows[0]!.storageEndGB!);
    expect(rows[11]!.images).toBe(0);
  });
  it("할당 디스크와 데이터 크기를 구분한다", () => {
    const s = createScenario(true); s.supabase.plan = "pro"; s.database.diskGB = 20;
    const r = forecast(s)[0]!;
    expect(r.dbUsedGB).toBeLessThan(.1);
    expect(r.costLines.find(l => l.id === "supabase-disk")!.payableUsd).toBeCloseTo(12 * 744 * s.catalog.supabase.diskGBHour);
  });
});

describe("사용량과 비용의 독립된 경계", () => {
  it("구매 묶음 제공량과 실제 월 한도를 구분한다", () => {
    const s = createScenario(true); Object.assign(s.groups[0]!, { activePct: 100, utilPct: 100, purchases: 2 });
    expect(forecast(s)[0]!.images).toBe(2000);
    s.groups[0]!.creditPerPurchase = true;
    expect(forecast(s)[0]!.images).toBe(4000);
  });
  it("팀의 마지막 3크레딧으로 4크레딧 예약을 시작하지 않는다", () => {
    const s = createScenario(true); const p = s.profiles[0]!;
    p.kind = "redesign-edit"; p.model = "redesign-openai";
    Object.assign(s.groups[0]!, { members: 100, activePct: 100, utilPct: 100, team: "team" });
    s.teams = [{ id: "team", monthlyQuota: 97 }];
    const row = forecast(s)[0]!;
    expect(row.images).toBe(94); expect(row.chargedCredits).toBe(94);
  });
  it("무료와 유료 회원을 별도 계수하고 무료에게 매출을 만들지 않는다", () => {
    const s = createScenario(true); s.groups[0]!.priceKrw = 10000;
    s.groups.push({ ...structuredClone(s.groups[0]!), id: "free", label: "무료", priceKrw: 0, members: 20 });
    const row = forecast(s)[0]!;
    expect(row.registered).toBe(120); expect(row.active).toBe(84);
    expect(row.grossSalesKrw).toBe(1000000); expect(row.images).toBe(1344);
  });
  it("충전액을 매출로 모두 잡지 않고 남은 잔액을 이월한다", () => {
    const s = createScenario(true); s.business.basis = "wallet";
    Object.assign(s.groups[0]!, { members: 1, priceKrw: 10000, quota: 10000, activePct: 100, utilPct: 50 });
    const rows = forecast(s);
    expect(rows[0]!.netSalesKrw).toBeLessThan(10000 / 1.1);
    expect(rows[0]!.grossSalesKrw).toBe(10000);
    expect(rows[0]!.walletUnspentKrw).toBeGreaterThanOrEqual(5000);
    expect(rows[0]!.chargedCredits + rows[0]!.walletUnspentKrw).toBeCloseTo(10000);
    expect(rows[1]!.chargedCredits + rows[1]!.walletUnspentKrw).toBeCloseTo(rows[0]!.walletUnspentKrw + 10000);
  });
  it("모델을 바꾸면 이전 실측 배지를 유지하지 않는다", () => {
    const s = createScenario(true);
    Object.assign(s.capacity, { mode: "measured", profileId: s.profiles[0]!.id, profileSignature: JSON.stringify(s.profiles[0]), measuredType: "t3.medium", measuredMaxJobs: 3, measuredOn: "2026-09-22" });
    expect(forecast(s)[0]!.recommendation.status).toBe("measurement-based");
    s.profiles[0]!.model = "nano-banana";
    expect(forecast(s)[0]!.recommendation.status).toBe("assumption-based");
  });
  it("추천 사양 선택은 실제 월별 비용에 들어간다", () => {
    const s = createScenario(true), manual = forecast(s)[0]!;
    s.aws.selection = "recommended";
    const recommended = forecast(s)[0]!;
    expect(recommended.awsType).toBe("t3.medium");
    expect(recommended.awsUsd! - manual.awsUsd!).toBeCloseTo((.052 - .013) * 744);
    expect(recommended.apiUsd).toBe(manual.apiUsd);
  });
});

describe("전송 경로·공유 한도·무료 혜택", () => {
  it("브라우저 캐시와 CDN 캐시는 다르며 생성 응답을 없애지 않는다", () => {
    const s = createScenario(true); Object.assign(s.transfers, { viewsPerImage: 2, downloadsPerImage: 1, browserCachePct: 50, cdnCachePct: 0, referenceMBPerOutput: 0 });
    const usage = { ...emptyUsage(), originalMB: 2, previewMB: 1, responseMB: 2, providerOutputs: 1 };
    const full = transferUsage(usage, 3, 0, s.transfers);
    expect(full.uncachedGB).toBeCloseTo(2); expect(full.awsGB).toBeCloseTo(2.002);
    const direct = transferUsage(usage, 3, 0, { ...s.transfers, proxyPct: 0, cdnCachePct: 50 });
    expect(direct.cachedGB).toBeCloseTo(1); expect(direct.uncachedGB).toBeCloseTo(1); expect(direct.awsGB).toBeCloseTo(.002);
  });
  it("송신 요금의 구간별 한도를 적용한다", () => {
    const s = createScenario(true); Object.assign(s.transfers, { awsFreeGB: 100, awsPerGB: .05, awsTiers: [{ upToGB: 1000, usdPerGB: .1 }] });
    expect(awsTransferCost(1200, s.transfers)).toBeCloseTo(105);
  });
  it("Supabase 캐시와 일반 전송의 포함량을 합쳐 쓰지 않는다", () => {
    const s = createScenario(true); s.supabase.plan = "pro";
    const q = quoteSupabase(s.supabase, { storageAverageGB: 0, dbUsedGB: 0, cachedGB: 0, uncachedGB: 260, mau: 0 }, 730, s.catalog);
    expect(q.usd).toBeCloseTo(25.9);
  });
  it("지출 상한과 공유 프로젝트 사용량이 제한 판단에 반영된다", () => {
    const s = createScenario(true); Object.assign(s.supabase, { plan: "pro", spendCap: true, otherStorageGB: 99 });
    const q = quoteSupabase(s.supabase, { storageAverageGB: 2, dbUsedGB: 0, cachedGB: 0, uncachedGB: 0, mau: 0 }, 730, s.catalog);
    expect(q.quotaExceeded).toBe(true);
  });
  it("월 중간 만료된 무료 크레딧을 나머지 기간에 적용하지 않는다", () => {
    const s = createScenario(true); Object.assign(s.aws, { type: "custom", monthlyUsd: 31, ebsGB: 0, ipv4Count: 0, benefit: "credit", creditUsd: 100, expiresOn: "2026-10-15" });
    const result = quoteAws(s.aws, new Date("2026-10-01Z"), 31, 0, { credit: 100 }, s.catalog);
    expect(result.benefitUsd).toBeCloseTo(14); expect(result.usd).toBeCloseTo(17);
  });
  it("비용/부하를 아는 척하는 대신 null을 전파한다", () => {
    const s = createScenario(true); s.storage.initialGB = null;
    const r = forecast(s)[0]!;
    expect(r.totalKrw).toBeNull(); expect(r.profitKrw).toBeNull(); expect(r.completeness).toBe("partial");
  });
  it("프로토타입 이름·중복 ID·미등록 비중을 거부한다", () => {
    const s = createScenario(true);
    expect(() => validateScenario({ ...s, profiles: [{ ...s.profiles[0], id: "__proto__" }] })).toThrow();
    expect(() => validateScenario({ ...s, groups: [s.groups[0], s.groups[0]] })).toThrow();
    s.groups[0]!.workMix = [{ id: "missing", weight: 100 }];
    expect(() => validateScenario(s)).toThrow();
  });
});
