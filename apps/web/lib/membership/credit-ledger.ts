import "server-only";
import { imageCredits, type CreditOutput, type CreditPolicyId } from "@fixup/shared";
import { createSupabaseAdminClient } from "../supabase/admin";

export const isCreditLedgerEnabled = () => process.env.CREDIT_LEDGER === "1";
export interface CreditReservationPlan { outputs: CreditOutput[]; resource: string; }
export function creditImagePlan(count: number, size: CreditOutput | undefined, resource: string): CreditReservationPlan | undefined {
  if (!size) return undefined;
  if (!Number.isSafeInteger(count) || count < 0 || count > 60) throw new Error("생성할 이미지 수를 확인하세요.");
  if (count > 0) imageCredits(size);
  return { outputs: Array.from({ length: count }, () => ({ ...size })), resource };
}
export const freeCreditPlan = (resource: string): CreditReservationPlan => ({ outputs: [], resource });

export async function markCreditStarted(reservation: { userId: string; requestId: string }) {
  if (!isCreditLedgerEnabled() || reservation.requestId === "local-dev") return;
  const { error } = await createSupabaseAdminClient().rpc("credit_mark_started", { p_user: reservation.userId, p_request: reservation.requestId });
  if (error) throw new Error(`생성 시작 기록 실패: ${error.message}`);
}

export async function bindCreditJob(reservation: { userId: string; requestId: string }, job: { key: string; resource: string; providerId: string; endpoint: string }) {
  if (!isCreditLedgerEnabled() || reservation.requestId === "local-dev") return;
  // Only image-v2 requests have a quote. Legacy accounts continue to use the old ledger.
  const db = createSupabaseAdminClient();
  const { data: event, error: readError } = await db.from("generation_events").select("pricing_policy").eq("user_id", reservation.userId).eq("request_id", reservation.requestId).single();
  if (readError) throw readError;
  if (event.pricing_policy !== "image-v2") return;
  const { error } = await db.rpc("credit_bind_job", { p_user: reservation.userId, p_request: reservation.requestId, p_job: job.key, p_resource: job.resource, p_provider: job.providerId, p_endpoint: job.endpoint });
  if (error) throw new Error(`과금 요청 연결 실패: ${error.message}`);
}

export async function lookupCreditJob(userId: string, key: string): Promise<{ request_id: string; resource_key: string; provider_request_id: string; endpoint: string } | null> {
  if (!isCreditLedgerEnabled()) return null;
  const { data, error } = await createSupabaseAdminClient().rpc("credit_lookup_job", { p_user: userId, p_job: key });
  if (error) throw error;
  if (!data) {
    const { data: account, error: accountError } = await createSupabaseAdminClient().from("credit_accounts").select("user_id").eq("user_id", userId).maybeSingle();
    if (accountError) throw accountError;
    if (account) throw new Error("credit_job_binding_required");
  }
  return data ?? null;
}

export type BillingPolicy = CreditPolicyId;

export async function closeCreditPoster(userId: string, projectId: string, requestId: string, status: "done" | "ready", clear: boolean) {
  const { error } = await createSupabaseAdminClient().rpc("credit_close_poster", { p_user: userId, p_project: projectId, p_request: requestId, p_status: status, p_clear: clear });
  if (error) throw error;
}
