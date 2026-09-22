import { describe, expect, it } from "vitest";
import { createScenario, validateScenario } from "../schema";
import { estimateWork } from "../work-profiles";
import { simulateMember } from "../usage";
import { forecast } from "../forecast";
import { quoteSupabase } from "../infrastructure";
import { recommendCapacity } from "../sizing";

const example = () => createScenario(true);
const profile = () => example().profiles[0]!;

describe("현재 서비스의 예약·확정 차감", () => {
  it.each([
    ["gpt-image-2.5-flare", 5, 20], ["nano-banana-pro", 3, 33], ["nano-banana", 1, 100],
  ])("%s: 개인의 남은 크레딧을 다른 회원에게 넘기지 않는다", (model, charged, count) => {
    const s = example();
    const w = estimateWork({ ...profile(), model }, s.catalog);
    expect(w.charged).toBe(charged);
    expect(simulateMember(100, 100, [w]).images).toBe(count);
  });
  it("기획과 이미지는 따로 올림한다", () => {
    const s = example(); const w = estimateWork({ ...profile(), plans: 1 }, s.catalog);
    expect(w.charged).toBe(6);
    expect(simulateMember(100, 100, [w]).images).toBe(16);
    expect(estimateWork({ ...profile(), plans: 5 }, s.catalog).charged).toBe(10);
  });
  it("부분 성공의 예약·차감과 공급자 과금 수를 구분한다", () => {
    const s = example(); const w = estimateWork({ ...profile(), images: 3, successCount: 2, billableCount: 3 }, s.catalog);
    expect(w.steps).toEqual([{ reserved: 13, charged: 9 }]);
    expect(w.images).toBe(2); expect(w.providerOutputs).toBe(3); expect(w.imageUsd).toBeCloseTo(.21072 * 3);
  });
  it("리디자인 수정의 시작 잔액과 사용 목표는 다르다", () => {
    const s = example(); const w = estimateWork({ ...profile(), kind: "redesign-edit", model: "redesign-openai" }, s.catalog);
    expect(w.required).toBe(4); expect(w.charged).toBe(1);
    expect(simulateMember(100, 100, [w]).images).toBe(97);
    expect(simulateMember(100, 10, [w]).images).toBe(10);
    expect(simulateMember(100, 100, [w]).apiUsd).toBeCloseTo(16.005);
  });
  it("캐릭터 각도 예약의 후보 1장과 두 단계 차감을 보존한다", () => {
    const s = example(); const w = estimateWork({ ...profile(), kind: "character", candidates: 1, angles: 3 }, s.catalog);
    expect(w.charged).toBe(4); expect(w.required).toBe(18);
    expect(simulateMember(100, 100, [w]).images).toBe(84);
  });
  it("PDP 8섹션을 실제 3/3/2 배치로 각각 올림한다", () => {
    const s = example(); const w = estimateWork({ ...profile(), kind: "pdp", images: 8 }, s.catalog);
    expect(w.steps.map(x => x.charged)).toEqual([13, 13, 9]);
  });
  it("nano-banana-2의 해상도 배수를 빠뜨리지 않는다", () => {
    const s = example(); const w = estimateWork({ ...profile(), model: "nano-banana-2" }, s.catalog);
    expect(w.imageUsd).toBeCloseTo(.12);
  });
  it("SNS 슬롯 호출과 완성 카드는 다르다", () => {
    const s = example(); const w = estimateWork({ ...profile(), kind: "sns", images: 2, slotsPerCard: 3 }, s.catalog);
    expect(w.providerOutputs).toBe(6); expect(w.images).toBe(2);
    expect(w.imageUsd).toBeGreaterThan(.21072 * 2);
  });
});

describe("월별 사용량·재고·한도", () => {
  it("같은 100크레딧의 기존/새 정책 비용을 비교하고 API 원가는 그대로 둔다", () => {
    const s = example(); Object.assign(s.groups[0]!, { activePct: 100, utilPct: 100 });
    const old = forecast(s)[0]!;
    s.business.policy = "image-v2";
    const next = forecast(s)[0]!;
    expect(old.images).toBe(2000); expect(next.images).toBe(10000);
    expect(old.apiUsd).toBeCloseTo(421.44); expect(next.apiUsd).toBeCloseTo(2107.2);
    expect(next.storageEndGB).toBeCloseTo(old.storageEndGB! * 5);
  });
  it("구매 크레딧은 매달 다시 주거나 다시 판매하지 않고 3개월 뒤 소멸한다", () => {
    const s = example(); s.business.policy = "image-v2";
    Object.assign(s.groups[0]!, { grant: "purchase", members: 1, priceKrw: 100000, activePct: 100, utilPct: 30 });
    const rows = forecast(s);
    expect(rows.slice(0, 4).map(r => r.images)).toEqual([30,21,14,0]);
    expect(rows[0]!.grossSalesKrw).toBe(100000); expect(rows[1]!.grossSalesKrw).toBe(0);
  });
  it("100명이 100개를 다 쓰면 2000장·$421.44, 평균과 월말을 분리한다", () => {
    const s = example(); s.groups[0]!.activePct = 100; s.groups[0]!.utilPct = 100;
    const rows = forecast(s);
    expect(rows[0]!.images).toBe(2000);
    expect(rows[0]!.apiUsd).toBeCloseTo(421.44);
    expect(rows[0]!.storageEndGB).toBeCloseTo(4.1);
    expect(rows[0]!.storageAverageGB).toBeCloseTo(2.05);
    expect(rows[11]!.storageEndGB).toBeCloseTo(49.2);
  });
  it("활성률·소진율은 각각 한 번 적용한다", () => {
    const rows = forecast(example());
    expect(rows[0]!.active).toBe(70); expect(rows[0]!.images).toBe(1120);
  });
  it("33장씩 100명이지 합쳐서 3333장이 아니다", () => {
    const s = example(); Object.assign(s.groups[0]!, { activePct: 100, utilPct: 100 }); s.profiles[0]!.model = "nano-banana-pro";
    expect(forecast(s)[0]!.images).toBe(3300);
  });
  it("회원 0이어도 초기 저장과 서버 비용은 사라지지 않는다", () => {
    const s = example(); s.groups[0]!.members = 0; s.storage.initialGB = 10;
    const row = forecast(s)[0]!;
    expect(row.images).toBe(0); expect(row.storageEndGB).toBe(10);
    expect(row.infraGrossUsd).toBeGreaterThan(0); expect(row.costPerMemberKrw).toBeNull();
  });
  it("처음 받은 크레딧은 다음 달에 자동 충전되지 않는다", () => {
    const s = example(); Object.assign(s.groups[0]!, { grant: "once", activePct: 100, utilPct: 100 });
    const rows = forecast(s); expect(rows[0]!.images).toBe(2000); expect(rows[1]!.images).toBe(0);
  });
  it("1회 지급에서 비활성 회원의 잔액을 보존한다", () => {
    const s = example(); Object.assign(s.groups[0]!, { grant: "once", activePct: 50, utilPct: 100 });
    const rows = forecast(s); expect(rows[0]!.images).toBe(1000); expect(rows[1]!.images).toBe(500);
  });
  it("보관 기한이 지나도 나이를 모르는 초기 파일은 지우지 않는다", () => {
    const s = example(); s.storage.initialGB = 10; s.storage.retentionMonths = 1;
    const rows = forecast(s); expect(rows[1]!.storageEndGB).toBeCloseTo(rows[0]!.storageEndGB!);
    expect(rows[1]!.storageEndGB).toBeGreaterThan(10);
  });
  it("재생성은 포스터에 누적되고 SNS 교체는 파일을 더 쌓지 않는다", () => {
    const a = example(); a.profiles[0]!.regenerations = 2;
    const b = structuredClone(a); b.profiles[0]!.kind = "sns";
    const wa = estimateWork(a.profiles[0]!, a.catalog), wb = estimateWork(b.profiles[0]!, b.catalog);
    expect(wa.providerOutputs).toBe(3); expect(wb.providerOutputs).toBe(3);
    expect(wa.savedImages).toBe(3); expect(wb.savedImages).toBe(1);
    expect(wb.uploadMB).toBeCloseTo(6.15); expect(wb.savedMB).toBeCloseTo(2.05);
    expect(wa.responseMB).toBe(0); expect(wb.responseMB).toBe(0);
  });
  it("한도 유지안은 Free 초과비용을 만들거나 전체 이익을 확정하지 않는다", () => {
    const s = example(); s.supabase.transition = "keep";
    const row = forecast(s)[0]!;
    expect(row.serviceability).toBe("quota-exceeded"); expect(row.profitKrw).toBeNull();
    expect(row.supabaseUsd).toBe(0);
  });
  it("미확인 값은 0원으로 대체하지 않는다", () => {
    const row = forecast(createScenario(false))[0]!;
    expect(row.completeness).toBe("partial"); expect(row.totalKrw).toBeNull();
    expect(row.storageEndGB).toBeNull(); expect(row.images).toBeGreaterThan(0);
  });
  it("판매가 변경은 같은 실제 차감 기준의 생성량을 바꾸지 않는다", () => {
    const s = example(), before = forecast(s)[0]!; s.groups[0]!.priceKrw = 20000;
    const after = forecast(s)[0]!;
    expect(after.images).toBe(before.images); expect(after.profitKrw).toBeGreaterThan(before.profitKrw!);
  });
});

describe("인프라·혜택·추천", () => {
  it("Supabase compute credit은 조직당 한 번이다", () => {
    const s = example(); s.supabase.plan = "pro"; s.supabase.compute = "small";
    const usage = { storageAverageGB: 0, dbUsedGB: 0, cachedGB: 0, uncachedGB: 0, mau: 0 };
    expect(quoteSupabase(s.supabase, usage, 730, s.catalog).usd).toBeCloseTo(30.038);
    s.supabase.otherComputeUsd = .01344 * 730;
    expect(quoteSupabase(s.supabase, usage, 730, s.catalog).usd).toBeCloseTo(39.8492);
  });
  it("AWS credit 잔액은 달 사이에 감소한다", () => {
    const s = example(); s.aws.type = "custom"; s.aws.hourlyUsd = null; s.aws.monthlyUsd = 20;
    s.aws.ebsGB = 0; s.aws.ipv4Count = 0; s.aws.otherMonthlyUsd = 0; s.transfers.awsPerGB = 0;
    s.aws.benefit = "credit"; s.aws.creditUsd = 25; s.aws.expiresOn = "2030-01-01";
    const rows = forecast(s); expect(rows[0]!.awsUsd).toBeCloseTo(0); expect(rows[1]!.awsUsd).toBeCloseTo(15);
  });
  it("같은 100명이어도 동시 부하가 다르면 후보가 바뀐다", () => {
    const s = example(); s.capacity.peakJobs = 1;
    expect(recommendCapacity(s.capacity, 70, 2000, s.aws, s.catalog).ec2Type).toBe("t3.small");
    s.capacity.peakJobs = 3;
    const result = recommendCapacity(s.capacity, 70, 2000, s.aws, s.catalog);
    expect(result.ec2Type).toBe("t3.medium"); expect(result.status).toBe("assumption-based");
    expect(result.cpuValidated).toBe(false);
  });
  it("후보 범위를 넘는 부하에 가장 큰 사양을 안전하다고 추천하지 않는다", () => {
    const s = example(); s.capacity.peakJobs = 1000;
    expect(recommendCapacity(s.capacity, 70, 2000, s.aws, s.catalog).ec2Type).toBeNull();
  });
  it("예전 고정비를 상세 인프라에 더하지 않는다", () => {
    const s = example(); s.business.infraMode = "manual-total"; s.business.manualInfraKrw = 10000;
    const row = forecast(s)[0]!;
    expect(row.totalKrw).toBeCloseTo(row.apiUsd * s.fx + 10000);
  });
});

describe("저장 입력의 경계", () => {
  it("모르는 버전·음수·NaN·실행 URL을 거부한다", () => {
    const s = example();
    expect(() => validateScenario({ ...s, version: 999 })).toThrow();
    expect(() => validateScenario({ ...s, fx: -1 })).toThrow();
    expect(() => validateScenario({ ...s, fx: NaN })).toThrow();
    expect(() => validateScenario({ ...s, evidence: { fx: { kind: "observed", source: "javascript:alert(1)", checkedAt: null } } })).toThrow();
  });
});
