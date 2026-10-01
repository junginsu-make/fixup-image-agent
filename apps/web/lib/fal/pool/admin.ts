import { createSupabaseAdminClient } from "../../supabase/admin";
import { readMasterKey } from "./key-crypto";
import type { FalAccountState } from "./store";

/**
 * 관리자 화면 「fal 계정」이 읽는 것(보충 2026-10-01). **키 원문·암호문은 여기 없다** — DB 함수가 이름·끝 4자리·
 * 상태·진행 중 수만 내보낸다(`fal_account_admin_list`).
 */

export interface FalAccountView {
  id: string;
  name: string;
  keyLast4: string;
  enabled: boolean;
  limit: number;
  state: FalAccountState;
  cooldownUntil: string | null;
  lastErrorKind: Exclude<FalAccountState, "ok"> | null;
  lastErrorAt: string | null;
  lastErrorDetail: string | null;
  inFlight: number;
}

export interface FalAccountEventView {
  at: string;
  action: string;
  actorEmail: string | null;
  name: string | null;
}

export interface FalPoolAdminView {
  /** 서버 열쇠 상태. ok 가 아니면 등록·키 바꾸기를 막고, 생성은 `FAL_KEY` 로 간다. */
  masterKey: "ok" | "missing" | "invalid";
  accounts: FalAccountView[];
  events: FalAccountEventView[];
}

type ListRow = {
  id: string; name: string; key_last4: string; enabled: boolean; concurrency_limit: number; state: FalAccountState;
  cooldown_until: string | null; last_error_kind: FalAccountView["lastErrorKind"]; last_error_at: string | null;
  last_error_detail: string | null; in_flight: number;
};
type EventRow = { created_at: string; action: string; actor_email: string | null; input: { name?: string } | null };

export async function readFalPoolForAdmin(environment: Record<string, string | undefined> = process.env): Promise<FalPoolAdminView> {
  const master = readMasterKey(environment.FAL_KEY_ENCRYPTION_SECRET);
  const admin = createSupabaseAdminClient();
  const [list, events] = await Promise.all([
    admin.rpc("fal_account_admin_list"),
    admin.rpc("fal_account_admin_events", { p_limit: 20 }),
  ]);
  if (list.error) throw new Error(`fal_account_admin_list: ${list.error.message}`);
  if (events.error) throw new Error(`fal_account_admin_events: ${events.error.message}`);
  return {
    masterKey: master.ok ? "ok" : master.reason,
    accounts: ((list.data ?? []) as ListRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      keyLast4: row.key_last4,
      enabled: row.enabled,
      limit: Number(row.concurrency_limit),
      state: row.state,
      cooldownUntil: row.cooldown_until,
      lastErrorKind: row.last_error_kind,
      lastErrorAt: row.last_error_at,
      lastErrorDetail: row.last_error_detail,
      inFlight: Number(row.in_flight),
    })),
    events: ((events.data ?? []) as EventRow[]).map((row) => ({
      at: row.created_at,
      action: row.action,
      actorEmail: row.actor_email,
      name: row.input?.name ?? null,
    })),
  };
}
