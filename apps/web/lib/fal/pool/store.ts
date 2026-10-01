/**
 * 계정 풀이 DB 에 묻는 일 전부(마이그레이션 `202610010001_fal_account_pool.sql`).
 * 라우터는 이 모양만 알고, 시험은 이 모양을 메모리로 흉내 낸다.
 */

export type FalAccountState = "ok" | "rate_limited" | "locked" | "invalid" | "decrypt_failed";
export type FalAccountFailure = Exclude<FalAccountState, "ok">;

export interface FalAccountRow {
  id: string;
  name: string;
  enabled: boolean;
  state: FalAccountState;
  key_ciphertext: string;
  key_iv: string;
  key_tag: string;
}

export interface FalPoolStore {
  /** 지우지 않은 계정 전부(꺼진 것 포함 — 꺼진 계정의 진행 중 요청도 물어야 한다). */
  liveAccounts(): Promise<FalAccountRow[]>;
  /** 칸 하나를 잡는다. 다 찼으면 null. */
  claim(endpoint: string, exclude: string[]): Promise<{ slotId: number; accountId: string } | null>;
  bind(slotId: number, requestId: string): Promise<void>;
  release(slotId: number): Promise<void>;
  finish(requestId: string): Promise<void>;
  /** 이 요청을 보낸 계정. 기록이 없으면(서버 키로 보낸 옛 요청) null. */
  accountOf(requestId: string): Promise<string | null>;
  /** 상태가 이번에 바뀌었으면 참(메일은 그때 한 번). */
  mark(accountId: string, kind: FalAccountFailure, detail: string): Promise<boolean>;
}

function fail(what: string, error: { message: string }): never {
  throw new Error(`[fal-pool] ${what}: ${error.message}`);
}

/**
 * Supabase 관리 클라이언트는 **부를 때** 들인다. 그 모듈은 `server-only` 를 들여서, 생성 경로 모듈
 * (상세페이지·카드뉴스 등)을 시험이 불러오기만 해도 깨진다.
 */
async function adminClient() {
  const { createSupabaseAdminClient } = await import("../../supabase/admin");
  return createSupabaseAdminClient();
}

export function supabaseFalPoolStore(): FalPoolStore {
  const db = adminClient;
  return {
    async liveAccounts() {
      const { data, error } = await (await db())
        .from("fal_accounts")
        .select("id,name,enabled,state,key_ciphertext,key_iv,key_tag")
        .is("deleted_at", null);
      if (error) fail("liveAccounts", error);
      return (data ?? []) as FalAccountRow[];
    },
    async claim(endpoint, exclude) {
      const { data, error } = await (await db()).rpc("fal_account_claim", { p_endpoint: endpoint, p_exclude: exclude });
      if (error) fail("claim", error);
      const row = (data as Array<{ slot_id: number; account_id: string }> | null)?.[0];
      return row ? { slotId: Number(row.slot_id), accountId: row.account_id } : null;
    },
    async bind(slotId, requestId) {
      const { error } = await (await db()).rpc("fal_request_bind", { p_slot: slotId, p_request: requestId });
      if (error) fail("bind", error);
    },
    async release(slotId) {
      const { error } = await (await db()).rpc("fal_request_release", { p_slot: slotId });
      if (error) fail("release", error);
    },
    async finish(requestId) {
      const { error } = await (await db()).rpc("fal_request_finish", { p_request: requestId });
      if (error) fail("finish", error);
    },
    async accountOf(requestId) {
      const { data, error } = await (await db())
        .from("fal_requests")
        .select("account_id")
        .eq("fal_request_id", requestId)
        .maybeSingle();
      if (error) fail("accountOf", error);
      return (data as { account_id?: string } | null)?.account_id ?? null;
    },
    async mark(accountId, kind, detail) {
      const { data, error } = await (await db()).rpc("fal_account_mark", { p_account: accountId, p_kind: kind, p_detail: detail });
      if (error) fail("mark", error);
      return data === true;
    },
  };
}
