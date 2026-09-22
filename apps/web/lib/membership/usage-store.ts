import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { isLocalStoreEnabled } from "../local-store";
import type { UsageEventRow } from "./usage-history";

/**
 * 내 사용 기록(최근 것부터). **대상은 부르는 쪽이 정한 본인뿐이다** — 계정 화면이 로그인한
 * 회원의 ID 로만 부른다. 관리 키로 읽지만 `user_id` 로 좁힌다.
 */
export async function readUsageHistory(userId: string, limit = 40): Promise<UsageEventRow[]> {
  if (isLocalStoreEnabled()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("generation_events")
    .select("id,operation,status,pricing_policy,requested_units,consumed_units,credit_phase,error_code,created_at,period_start")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`사용 기록을 읽지 못했습니다: ${error.message}`);
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

/** 받은 크레딧(지급 묶음). 크레딧 장부가 없으면(로컬·마이그레이션 전) 빈 목록. */
export async function readMyGrants(userId: string): Promise<GrantRow[]> {
  if (isLocalStoreEnabled()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from("credit_grants")
    .select("id,kind,granted_units,consumed_units,reserved_units,granted_at,expires_at,revoked_at,source_key")
    .eq("user_id", userId)
    .order("granted_at", { ascending: false })
    .limit(20);
  if (error) return [];
  return (data ?? []) as GrantRow[];
}
