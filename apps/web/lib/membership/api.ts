import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { hasFullScope, viewerFrom } from "../access/core";
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
  if (!hasFullScope(viewerFrom(auth.member), "delete")) {
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
    // 2026-09-04 운영에서 이 오류가 났는데 journalctl 에 한 줄도 없어 원인을 못
    // 찾았다. 사용자에게 가는 문장은 하나지만 원인은 둘로 갈린다 — RPC 자체가
    // 실패한 것(rpc_error)과, 호출은 됐는데 행이 안 온 것(empty_result)은
    // 볼 곳이 다르다. 사용자 id·요청 id 까지만 남긴다. 이메일·키는 남기지 않는다.
    logUsageFailure("예약 실패", error, {
      cause: error ? "rpc_error" : "empty_result",
      userId: auth.member.userId,
      requestId,
      operation,
      units,
    });
    return { ok: false, response: membershipApiError(500, "usage_unavailable", "사용량을 확인하지 못했습니다.") };
  }
  const row = data[0];
  const usage = usageFromRpc(row);
  if (!row.allowed) {
    const messages: Record<string, string> = {
      quota_exceeded: "이번 달 이미지 생성 한도를 모두 사용했습니다.",
      // 내 한도가 아니라 팀 한도에 걸린 것이다. 같은 말로 뭉뚱그리면 「내
      // 한도를 늘려 달라」고 운영자에게 말하게 되는데 그래도 안 풀린다.
      team_quota_exceeded: "팀의 이번 달 생성 한도를 모두 사용했습니다. 팀장에게 문의해 주세요.",
      concurrent_limit: "이미 생성 중인 요청이 있습니다. 완료 후 다시 시도해 주세요.",
      analysis_rate_limit: "분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      duplicate_request: "이미 처리된 요청입니다. 새로고침 후 다시 시도해 주세요.",
    };
    const status = ["quota_exceeded", "team_quota_exceeded", "concurrent_limit", "analysis_rate_limit"]
      .includes(row.reason) ? 429 : 409;
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
  if (error || !data?.[0]) {
    // 던지기만 하면 호출한 라우트가 catch 에서 다시 finalize 를 불러 또 던지고,
    // 결국 500 만 남는다 — 어느 회원의 어느 요청이 매달렸는지가 사라진다.
    // 예약된 채 묶인 크레딧을 손으로 풀려면 이 두 값이 있어야 한다.
    logUsageFailure("확정 실패", error, {
      cause: error ? "rpc_error" : "empty_result",
      userId: reservation.userId,
      requestId: reservation.requestId,
      success,
      consumedUnits,
      errorCode: errorCode ?? null,
    });
    throw error ?? new Error("사용량 확정에 실패했습니다.");
  }

  if (cost && cost.billableImages > 0) {
    const { error: costError } = await admin
      .from("generation_events")
      .update({ model: cost.model, billable_images: cost.billableImages })
      .eq("user_id", reservation.userId)
      .eq("request_id", reservation.requestId);
    // 어느 요청의 비용이 빈 것인지 없으면 장부를 손으로 메울 수 없다.
    if (costError) {
      logUsageFailure("비용 기록 실패", costError, {
        userId: reservation.userId,
        requestId: reservation.requestId,
        model: cost.model,
        billableImages: cost.billableImages,
      });
    }
  }

  return usageFromRpc(data[0]);
}

/**
 * 사용량 처리가 어긋난 자리를 서버 로그에 남긴다.
 *
 * 이 저장소에는 로거가 따로 없다. 기존 방식(`[usage] …`)의 태그를 그대로 쓴다.
 *
 * 객체를 그냥 넘기지 않고 JSON 한 줄로 만든다. 넘기면 node 가 예쁘게 여러
 * 줄로 쪼개 찍어서, journalctl 에서 `[usage]` 로 걸러도 첫 줄만 남고 정작
 * 원인인 오류 칸이 잘려 나간다. 이 함수는 그 잘림을 막으려고 있는 것이다.
 *
 * Supabase 오류는 통째로 넘기지 않고 네 칸만 뽑는다. 통째로 넘기면 나중에
 * 무엇이 더 딸려 들어올지 우리가 통제할 수 없다 — 로그는 지울 수 없다.
 */
function logUsageFailure(
  what: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null,
  context: Record<string, unknown>,
) {
  const payload = {
    ...context,
    error: error
      ? { code: error.code, message: error.message, details: error.details, hint: error.hint }
      : null,
  };
  console.error(`[usage] ${what} ${JSON.stringify(payload)}`);
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
