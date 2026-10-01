import { describe, expect, it, vi } from "vitest";

/** RPC 의 jsonb → 화면 모양. 모르는 칸은 0 — 없는 숫자를 지어내지 않는다. */
vi.mock("server-only", () => ({}));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));

const { parseAiCostReport } = await import("../report");

describe("AI 비용 보고 읽기", () => {
  it("DB 가 준 칸을 옮긴다(numeric 은 문자열로 올 수 있다)", () => {
    const report = parseAiCostReport({
      days: 30, today_usd: "1.5", month_usd: 7, window_usd: 9,
      daily: [{ day: "2026-09-30", usd: "1.5", calls: 2 }],
      by_provider: [{ key: "fal", usd: "4", calls: 1, images: 2 }],
      by_operation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }],
    });
    expect(report).toEqual({
      days: 30, todayUsd: 1.5, monthUsd: 7, windowUsd: 9,
      daily: [{ day: "2026-09-30", usd: 1.5, calls: 2 }],
      byProvider: [{ key: "fal", usd: 4, calls: 1, images: 2 }],
      byOperation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }],
    });
  });

  it("비었거나 이상한 값은 0·빈 목록", () => {
    expect(parseAiCostReport(null)).toEqual({ days: 0, todayUsd: 0, monthUsd: 0, windowUsd: 0, daily: [], byProvider: [], byOperation: [] });
    expect(parseAiCostReport({ today_usd: "abc" }).todayUsd).toBe(0);
  });
});
