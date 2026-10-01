import { createSupabaseAdminClient } from "../supabase/admin";
import { AI_PAUSED_SETTING_KEY, aiPausedFrom } from "./pause";

/**
 * **AI 전체 비용 보고**(설계 2026-09-30 §3.4 · C4). `ai_cost_events` 를 한국 시각으로 모은다.
 *
 * 집계는 새 RPC `admin_ai_cost_report` 하나로만 한다. 기존 `admin_cost_*` 는 같은 DB 를 보는
 * detail-page-studio 가 부르므로 건드리지 않는다.
 */

export interface AiCostSlice {
  key: string;
  usd: number;
  calls: number;
  images: number;
}

export interface AiCostReport {
  days: number;
  todayUsd: number;
  monthUsd: number;
  windowUsd: number;
  daily: Array<{ day: string; usd: number; calls: number }>;
  byProvider: AiCostSlice[];
  byOperation: AiCostSlice[];
}

const n = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const slices = (value: unknown): AiCostSlice[] =>
  (Array.isArray(value) ? value : []).map((row: Record<string, unknown>) => ({
    key: String(row.key ?? ""),
    usd: n(row.usd),
    calls: n(row.calls),
    images: n(row.images),
  }));

/** RPC 가 준 jsonb 를 화면이 쓰는 모양으로. 모르는 칸은 0 으로 둔다 — 없는 숫자를 지어내지 않는다. */
export function parseAiCostReport(raw: unknown): AiCostReport {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    days: n(row.days),
    todayUsd: n(row.today_usd),
    monthUsd: n(row.month_usd),
    windowUsd: n(row.window_usd),
    daily: (Array.isArray(row.daily) ? row.daily : []).map((day: Record<string, unknown>) => ({
      day: String(day.day ?? ""),
      usd: n(day.usd),
      calls: n(day.calls),
    })),
    byProvider: slices(row.by_provider),
    byOperation: slices(row.by_operation),
  };
}

/**
 * 못 읽으면 `null` — 화면은 「아직 준비 전」으로 보인다. 마이그레이션 전 서버에는 함수가 없다.
 * 던지지 않는 이유: 이 표 하나 때문에 시스템 관리 탭 전체(문의함·플랜)가 500 이 되면 안 된다.
 */
export async function getAiCostReport(days = 30): Promise<AiCostReport | null> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("admin_ai_cost_report", { p_days: days });
    if (error) throw new Error(error.message);
    return parseAiCostReport(data);
  } catch (error) {
    console.warn("[ai-control] AI 비용 보고를 읽지 못했습니다", { message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * 관리자 화면에 보일 스위치 상태. **못 읽으면 던진다** — 멈췄는지 모르는 채 「켜짐」이라고
 * 보이면 관리자가 멈추려고 누른 단추가 반대로 동작한다.
 */
export async function readAiPausedForAdmin(): Promise<boolean> {
  const { data, error } = await createSupabaseAdminClient()
    .from("app_settings")
    .select("value")
    .eq("key", AI_PAUSED_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`AI 멈춤 스위치를 읽지 못했습니다: ${error.message}`);
  return aiPausedFrom(data?.value);
}
