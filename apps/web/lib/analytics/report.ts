import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **방문 분석 보고**(계획 2026-10-06 site-analytics, 2단계). RPC 가 준 jsonb 를 화면 모양으로 바꾼다.
 * 모르는 칸은 0·빈 목록 — 없는 숫자를 지어내지 않는다(`lib/ai-control/report.ts` 와 같은 판단).
 */

export interface Slice { key: string; views: number; visitors: number }
export interface DailyVisit { day: string; visitors: number; members: number; views: number; signups: number }
export interface SiteTraffic {
  days: number; todayVisitors: number; visitorDays: number; views: number; members: number;
  sessions: number; avgSessionSeconds: number; avgViewsPerSession: number;
  consentRate: number; knownBrowsers: number; returningBrowsers: number;
  daily: DailyVisit[]; sources: Slice[]; campaigns: Slice[]; landingPages: Slice[]; pages: Slice[]; devices: Slice[]; browsers: Slice[];
}
export interface FeatureUse { key: string; calls: number; users: number; failed: number }
export interface MemberUse { id: string; email: string; name: string | null; views: number; calls: number; lastSeen: string | null }
export interface SitePeople {
  days: number; activeMembers: number; newMembers: number; withReferral: number;
  byProvider: Array<{ key: string; members: number }>; signupSources: Array<{ key: string; members: number }>;
  features: FeatureUse[]; topMembers: MemberUse[];
}

type Row = Record<string, unknown>;
const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const rows = (value: unknown): Row[] => (Array.isArray(value) ? value : []) as Row[];
const obj = (raw: unknown): Row => (raw && typeof raw === "object" ? raw : {}) as Row;
const textOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const slices = (value: unknown): Slice[] =>
  rows(value).map((row) => ({ key: String(row.key ?? ""), views: n(row.views), visitors: n(row.visitors) }));
const memberCounts = (value: unknown) => rows(value).map((row) => ({ key: String(row.key ?? ""), members: n(row.members) }));

export function parseSiteTraffic(raw: unknown): SiteTraffic {
  const row = obj(raw);
  return {
    days: n(row.days),
    todayVisitors: n(row.today_visitors),
    visitorDays: n(row.visitor_days),
    views: n(row.views),
    members: n(row.members),
    sessions: n(row.sessions),
    avgSessionSeconds: n(row.avg_session_seconds),
    avgViewsPerSession: n(row.avg_views_per_session),
    consentRate: n(row.consent_rate),
    knownBrowsers: n(row.known_browsers),
    returningBrowsers: n(row.returning_browsers),
    daily: rows(row.daily).map((d) => ({
      day: String(d.day ?? ""), visitors: n(d.visitors), members: n(d.members), views: n(d.views), signups: n(d.signups),
    })),
    sources: slices(row.sources),
    campaigns: slices(row.campaigns),
    landingPages: slices(row.landing_pages),
    pages: slices(row.pages),
    devices: slices(row.devices),
    browsers: slices(row.browsers),
  };
}

export function parseSitePeople(raw: unknown): SitePeople {
  const row = obj(raw);
  return {
    days: n(row.days),
    activeMembers: n(row.active_members),
    newMembers: n(row.new_members),
    withReferral: n(row.with_referral),
    byProvider: memberCounts(row.by_provider),
    signupSources: memberCounts(row.signup_sources),
    features: rows(row.features).map((f) => ({ key: String(f.key ?? ""), calls: n(f.calls), users: n(f.users), failed: n(f.failed) })),
    topMembers: rows(row.top_members).map((m) => ({
      id: String(m.id ?? ""), email: String(m.email ?? ""), name: textOrNull(m.name),
      views: n(m.views), calls: n(m.calls), lastSeen: textOrNull(m.last_seen),
    })),
  };
}

/** 못 읽으면 null — 탭은 「준비 전」으로 열린다. 던지면 관리자 화면 전체가 500 이 된다. */
async function readReport<T>(fn: string, days: number, parse: (raw: unknown) => T): Promise<T | null> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc(fn, { p_days: days });
    if (error) throw new Error(error.message);
    return parse(data);
  } catch (error) {
    console.warn(`[analytics] ${fn} 를 읽지 못했습니다`, { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export const getSiteTraffic = (days: number) => readReport("admin_site_traffic", days, parseSiteTraffic);
export const getSitePeople = (days: number) => readReport("admin_site_people", days, parseSitePeople);
