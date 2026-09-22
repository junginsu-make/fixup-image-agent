import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import type { UsageEventRow } from "./usage-history";

/**
 * 내 사용 기록(최근 것부터). **대상은 부르는 쪽이 정한 본인뿐이다** — 계정 화면이 로그인한
 * 회원의 ID 로만 부른다. 관리 키로 읽지만 `user_id` 로 좁힌다.
 */
export const USAGE_HISTORY_LIMIT = 40;

/**
 * 못 읽으면 `null` 이다. 던지면 계정 화면 전체(잔액·회원 정보까지)가 오류로 바뀐다 —
 * 기록 한 칸 때문에 그럴 일은 아니다(독립 리뷰 2026-09-22).
 */
export async function readUsageHistory(userId: string, limit = USAGE_HISTORY_LIMIT): Promise<UsageEventRow[] | null> {
  if (isLocalStoreEnabled()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("generation_events")
    .select("id,operation,status,pricing_policy,requested_units,consumed_units,credit_phase,error_code,created_at,period_start")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) {
    console.error("[usage] 사용 기록을 읽지 못했습니다", error);
    return null;
  }
  return (data ?? []) as UsageEventRow[];
}

export interface GrantRow {
  id: string;
  kind: string;
  granted_units: number;
  consumed_units: number;
  reserved_units: number;
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  source_key: string;
}

/**
 * 받은 크레딧(지급 묶음). 못 읽으면 `null` — 빈 목록으로 두면 돈 낸 회원에게 「받은
 * 크레딧이 없습니다」라고 거짓말을 한다(독립 리뷰 2026-09-22).
 */
export async function readMyGrants(userId: string): Promise<GrantRow[] | null> {
  if (isLocalStoreEnabled()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("credit_grants")
    .select("id,kind,granted_units,consumed_units,reserved_units,granted_at,expires_at,revoked_at,source_key")
    .eq("user_id", userId)
    .order("granted_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error("[usage] 받은 크레딧을 읽지 못했습니다", error);
    return null;
  }
  return (data ?? []) as GrantRow[];
}
