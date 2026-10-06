import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const rpcCalls: Array<{ fn: string; args: unknown }> = [];
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  }),
}));
const { getSitePeopleBefore, getSiteTraffic, getSiteTrafficBefore, parseSitePeople, parseSiteTraffic } = await import("../report");

describe("parseSiteTraffic", () => {
  it("DB 이름(snake_case)을 화면 이름으로, 숫자 문자열을 숫자로", () => {
    const r = parseSiteTraffic({
      days: 7, today_visitors: "2", visitor_days: 4, views: 6, members: 2, sessions: 5,
      avg_session_seconds: "120", avg_views_per_session: "1.2",
      consent_rate: "0.500", known_browsers: 1, returning_browsers: 1,
      daily: [{ day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 }],
      sources: [{ key: "(direct)", views: 2, visitors: 2 }], campaigns: [], landing_pages: [], pages: [], devices: [], browsers: [],
    });
    expect(r).toMatchObject({ todayVisitors: 2, avgSessionSeconds: 120, avgViewsPerSession: 1.2, consentRate: 0.5, returningBrowsers: 1 });
    expect(r.daily[0]).toEqual({ day: "2026-10-06", visitors: 2, members: 1, views: 4, signups: 1 });
    expect(r.sources[0]).toEqual({ key: "(direct)", views: 2, visitors: 2 });
  });
  it("빈 값·이상한 값은 0·빈 목록 — 없는 숫자를 지어내지 않는다", () => {
    const r = parseSiteTraffic(null);
    expect(r.views).toBe(0);
    expect(r.daily).toEqual([]);
    expect(parseSiteTraffic({ views: "NaN" }).views).toBe(0);
  });
});

describe("parseSitePeople", () => {
  it("회원 줄의 이름·마지막 방문이 없으면 null, 가입자 첫 유입을 옮긴다", () => {
    const r = parseSitePeople({
      top_members: [{ id: "u", email: "e", name: null, views: 1, calls: 0, last_seen: null }],
      signup_sources: [{ key: "youtube", members: "1" }],
    });
    expect(r.topMembers[0]).toEqual({ id: "u", email: "e", name: null, views: 1, calls: 0, lastSeen: null });
    expect(r.signupSources).toEqual([{ key: "youtube", members: 1 }]);
    expect(r.features).toEqual([]);
  });
});

describe("getSiteTraffic", () => {
  it("함수가 없으면(마이그레이션 전) null — 탭은 열린다", async () => {
    rpcResult = { data: null, error: { message: "function admin_site_traffic does not exist" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await getSiteTraffic(30)).toBeNull();
    warn.mockRestore();
  });
});

describe("지난 기간 읽기", () => {
  it("이번 기간은 p_days 만 넘긴다", async () => {
    rpcCalls.length = 0;
    rpcResult = { data: {}, error: null };
    await getSiteTraffic(7);
    expect(rpcCalls).toEqual([{ fn: "admin_site_traffic", args: { p_days: 7 } }]);
  });
  it("지난 기간은 p_now 를 days 일 전 같은 시각으로 넘긴다", async () => {
    rpcCalls.length = 0;
    rpcResult = { data: {}, error: null };
    const now = new Date("2026-10-06T03:00:00Z");
    await getSiteTrafficBefore(7, now);
    await getSitePeopleBefore(7, now);
    expect(rpcCalls).toEqual([
      { fn: "admin_site_traffic", args: { p_days: 7, p_now: "2026-09-29T03:00:00.000Z" } },
      { fn: "admin_site_people", args: { p_days: 7, p_now: "2026-09-29T03:00:00.000Z" } },
    ]);
  });
  it("못 읽으면 null", async () => {
    rpcResult = { data: null, error: { message: "boom" } };
    expect(await getSiteTrafficBefore(7, new Date())).toBeNull();
  });
});
