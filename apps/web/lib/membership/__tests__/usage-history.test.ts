import { describe, expect, it } from "vitest";
import { describeUsageEvent, monthlyCreditTotal, type UsageEventRow } from "../usage-history";

/**
 * **내 크레딧 사용 기록** (2026-09-22 사용자 요청 — 「사용기록이 정확해야 합니다」).
 *
 * 한 줄 한 줄이 잔액 계산(`credit_wallet_state`)과 같은 규칙이어야 한다. 기록의 합과
 * 「이번 달 사용」이 다르면 기록을 믿을 수 없다.
 */
const row = (over: Partial<UsageEventRow>): UsageEventRow => ({
  id: "1", operation: "poster_image", status: "succeeded", pricing_policy: "image-v2",
  requested_units: 1, consumed_units: 1, credit_phase: "settled", error_code: null,
  created_at: "2026-09-22T03:00:00Z", period_start: "2026-09-01", ...over,
});

describe("한 줄", () => {
  it("성공은 쓴 크레딧만큼 빠진다", () => {
    const line = describeUsageEvent(row({ consumed_units: 2, requested_units: 2 }));
    expect(line.tool).toBe("이미지 만들기");
    expect(line.amount).toBe("-2크레딧");
    expect(line.status).toBe("완료");
    expect(line.charged).toBe(2);
  });

  /** 여러 장 중 일부만 나왔으면 나온 것만 빠진다. 그 사실을 말해야 「왜 3이 아니라 2지」가 안 된다. */
  it("일부만 성공하면 나온 만큼만 빠지고 그렇게 말한다", () => {
    const line = describeUsageEvent(row({ requested_units: 3, consumed_units: 2 }));
    expect(line.amount).toBe("-2크레딧");
    expect(line.status).toBe("일부 완료 · 1크레딧 돌려받음");
  });

  it("실패는 빠지지 않는다", () => {
    const line = describeUsageEvent(row({ status: "failed", consumed_units: 0, requested_units: 4 }));
    expect(line.amount).toBe("0");
    expect(line.status).toBe("실패 · 차감 없음");
    expect(line.charged).toBe(0);
  });

  it("처리 중은 잡아 둔 크레딧을 보여 주고 아직 빠진 것은 아니라고 말한다", () => {
    const line = describeUsageEvent(row({ status: "reserved", consumed_units: 0, requested_units: 3, credit_phase: "started" }));
    expect(line.amount).toBe("3크레딧 잡아 둠");
    expect(line.status).toBe("처리 중");
    expect(line.charged).toBe(0);
  });

  it("결과를 확인해야 하는 작업은 확인 대기라고 말한다", () => {
    const line = describeUsageEvent(row({ status: "reserved", consumed_units: 0, requested_units: 2, credit_phase: "needs_review" }));
    expect(line.status).toBe("확인 대기 · 운영자가 확인 후 확정하거나 돌려드립니다");
  });

  it("분석처럼 크레딧이 안 드는 일은 무료라고 말한다", () => {
    const line = describeUsageEvent(row({ operation: "pdp_analyze", requested_units: 0, consumed_units: 0 }));
    expect(line.tool).toBe("상세페이지 · 분석");
    expect(line.amount).toBe("무료");
  });

  /** 크레딧 적용 전 기록은 단위가 다르다(장). 크레딧처럼 보이면 잔액과 안 맞아 보인다. */
  it("크레딧 적용 전 기록은 옛 단위로, 크레딧에 안 섞는다", () => {
    const line = describeUsageEvent(row({ pricing_policy: "cost-v1", consumed_units: 5 }));
    expect(line.amount).toBe("5장");
    expect(line.legacy).toBe(true);
    expect(line.charged).toBe(0);
  });

  it("모르는 도구 이름은 그대로 보여 준다 — 비워 두지 않는다", () => {
    expect(describeUsageEvent(row({ operation: "something_new" })).tool).toBe("something_new");
  });
});

describe("이번 달 합계", () => {
  /** 잔액 계산과 같은 규칙 — 새 기준·이번 달·성공한 것의 consumed_units 합. */
  it("잔액의 「이번 달 사용」과 같은 규칙으로 더한다", () => {
    const rows = [
      row({ consumed_units: 2, requested_units: 2 }),
      row({ id: "2", status: "failed", consumed_units: 0 }),
      row({ id: "3", status: "reserved", consumed_units: 0, requested_units: 3 }),
      row({ id: "4", pricing_policy: "cost-v1", consumed_units: 9 }),
      row({ id: "5", period_start: "2026-08-01", consumed_units: 7 }),
    ];
    expect(monthlyCreditTotal(rows, "2026-09-01")).toBe(2);
  });
});
