import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { devMemberProfile, devUsageSummary, isLocalAuthBypass } from "../dev-auth";
import type { GenerationOperation, MemberProfile, UsageSummary } from "./types";

type ApiMember = { userId: string; profile: MemberProfile };

export async function authenticateApiMember(): Promise<
  | { ok: true; member: ApiMember }
  | { ok: false; response: Response }
> {
  if (isLocalAuthBypass) {
    return { ok: true, member: { userId: devMemberProfile.id, profile: devMemberProfile } };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { ok: false, response: membershipApiError(401, "unauthenticated", "로그인이 필요합니다.") };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at")
    .eq("id", user.id)
    .single();
  if (!profile) {
    return { ok: false, response: membershipApiError(403, "profile_not_found", "회원 정보를 찾지 못했습니다.") };
  }
  const typed = profile as MemberProfile;
  if (!typed.email_confirmed_at) {
    return { ok: false, response: membershipApiError(403, "email_unconfirmed", "이메일 인증을 완료해 주세요.") };
  }
  if (typed.status === "pending") {
    return { ok: false, response: membershipApiError(403, "pending", "관리자 승인 대기 중입니다.") };
  }
  if (typed.status === "suspended") {
    return { ok: false, response: membershipApiError(403, "suspended", "이용이 정지된 계정입니다.") };
  }
  return { ok: true, member: { userId: user.id, profile: typed } };
}

export async function authenticateApiAdmin() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth;
  if (auth.member.profile.role !== "admin") {
    return { ok: false as const, response: membershipApiError(403, "admin_required", "관리자 권한이 필요합니다.") };
  }
  return auth;
}

export async function reserveAiUsage(
  request: Request,
  operation: GenerationOperation,
  units: number,
): Promise<
  | { ok: true; userId: string; requestId: string; usage: UsageSummary }
  | { ok: false; response: Response }
> {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth;
  // 우회 계정은 profiles 행이 없어 사용량 RPC가 실패한다. 로컬에서는 집계를 건너뛴다.
  if (isLocalAuthBypass) {
    return { ok: true, userId: devMemberProfile.id, requestId: "local-dev", usage: devUsageSummary };
  }
  const requestId = request.headers.get("x-idempotency-key");
  if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return { ok: false, response: membershipApiError(400, "idempotency_key_required", "요청 식별자가 올바르지 않습니다.") };
  }

  const admin = createSupabaseAdminClient();
  const configuredAnalysisLimit = Number(process.env.ANALYZE_HOURLY_LIMIT || 10);
  const analysisLimit = Number.isFinite(configuredAnalysisLimit)
    ? Math.min(1000, Math.max(1, Math.floor(configuredAnalysisLimit)))
    : 10;
  const { data, error } = await admin.rpc("reserve_generation", {
    p_user_id: auth.member.userId,
    p_request_id: requestId,
    p_operation: operation,
    p_units: units,
    p_analysis_limit: analysisLimit,
  });
  if (error || !data?.[0]) {
    return { ok: false, response: membershipApiError(500, "usage_unavailable", "사용량을 확인하지 못했습니다.") };
  }
  const row = data[0];
  const usage = usageFromRpc(row);
  if (!row.allowed) {
    const messages: Record<string, string> = {
      quota_exceeded: "이번 달 이미지 생성 한도를 모두 사용했습니다.",
      concurrent_limit: "이미 생성 중인 요청이 있습니다. 완료 후 다시 시도해 주세요.",
      analysis_rate_limit: "분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      duplicate_request: "이미 처리된 요청입니다. 새로고침 후 다시 시도해 주세요.",
    };
    const status = ["quota_exceeded", "concurrent_limit", "analysis_rate_limit"].includes(row.reason) ? 429 : 409;
    return {
      ok: false,
      response: membershipApiError(status, row.reason, messages[row.reason] ?? "요청을 처리할 수 없습니다.", usage),
    };
  }
  return { ok: true, userId: auth.member.userId, requestId, usage };
}

/**
 * 사용량을 확정한다.
 *
 * `cost` 는 우리가 실제로 낸 돈을 남기기 위한 것이다. 회원 차감(consumedUnits)과
 * 다르다 — 실패해서 회원에게 안 물린 장도 우리는 이미 값을 치렀다. 모델을
 * 남기지 않으면 나중에 어떤 값으로 곱해야 할지 알 수 없어 비용을 되살릴 수 없다.
 *
 * 비용 기록이 실패해도 사용량 확정은 되돌리지 않는다. 장부가 조금 비는 것보다
 * 회원의 크레딧이 예약된 채 묶이는 쪽이 훨씬 나쁘다.
 */
export async function finalizeAiUsage(
  reservation: { userId: string; requestId: string },
  success: boolean,
  consumedUnits: number,
  errorCode?: string,
  cost?: { model: string; billableImages: number },
) {
  if (isLocalAuthBypass) return devUsageSummary;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("finalize_generation", {
    p_user_id: reservation.userId,
    p_request_id: reservation.requestId,
    p_success: success,
    p_consumed_units: consumedUnits,
    p_error_code: errorCode ?? null,
  });
  if (error || !data?.[0]) throw error ?? new Error("사용량 확정에 실패했습니다.");

  if (cost && cost.billableImages > 0) {
    const { error: costError } = await admin
      .from("generation_events")
      .update({ model: cost.model, billable_images: cost.billableImages })
      .eq("user_id", reservation.userId)
      .eq("request_id", reservation.requestId);
    if (costError) console.warn("[usage] 비용 기록 실패", costError);
  }

  return usageFromRpc(data[0]);
}

function usageFromRpc(row: Record<string, unknown>): UsageSummary {
  const used = Number(row.used_units ?? 0);
  const reserved = Number(row.reserved_units ?? 0);
  const quota = Number(row.quota ?? 0);
  return {
    used,
    reserved,
    quota,
    remaining: Math.max(0, quota - used - reserved),
    periodStart: String(row.current_period_start ?? ""),
    periodEnd: String(row.current_period_end ?? ""),
  };
}

export function membershipApiError(
  status: number,
  code: string,
  message: string,
  usage?: UsageSummary,
) {
  return Response.json({ ok: false, code, message, error: message, usage }, { status });
}
