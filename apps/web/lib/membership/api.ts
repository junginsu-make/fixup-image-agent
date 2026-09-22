import "server-only";

import { createSupabaseAdminClient } from "../supabase/admin";
import { isPdpJobsEnabled } from "../pdp/jobs/flags";
import { hasFullScope, viewerFrom } from "../access/core";
import { createSupabaseServerClient } from "../supabase/server";
import { devMemberProfile, devUsageSummary, isLocalAuthBypass } from "../dev-auth";
import { hourlyLimitFor } from "./hourly-limit";
import type { GenerationOperation, MemberProfile, UsageSummary } from "./types";
import { imageCredits } from "@fixup/shared";
import { isCreditLedgerEnabled, type CreditReservationPlan } from "./credit-ledger";
import { usageFromRow } from "./usage-row";

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
  creditPlan?: CreditReservationPlan,
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
  /*
    **작업마다 제 한도를 본다**(C-7).

    전에는 `ANALYZE_HOURLY_LIMIT` 하나였다. 레퍼런스 분석이 같은 칸을 쓰면
    레퍼런스를 정리하다가 그날 상세페이지를 못 만들게 된다 — 한자리에서 스무
    장을 올리는 일이 정상이기 때문이다. 표는 `hourly-limit.ts` 에 있다.

    **이 한도는 두 정책에 다 간다.** 장부를 켜면 `credit_reserve_dispatch` 가
    같은 값을 받아 옛 경로로 그대로 넘긴다 — 전환 안 한 회원이 정책 스위치
    하나로 다른 한도를 받으면 안 된다.
  */
  const analysisLimit = hourlyLimitFor(operation);
  const ledger = isCreditLedgerEnabled();
  const { data, error } = await admin.rpc(ledger ? "credit_reserve_dispatch" : "reserve_generation", ledger ? {
    p_user: auth.member.userId, p_request: requestId, p_operation: operation, p_legacy_units: units, p_analysis_limit: analysisLimit,
    p_outputs: creditPlan ? creditPlan.outputs.map(imageCredits) : null, p_resource: creditPlan?.resource ?? new URL(request.url).pathname,
  } : {
    p_user_id: auth.member.userId,
    p_request_id: requestId,
    p_operation: operation,
    p_units: units,
    p_analysis_limit: analysisLimit,
  });
  if (error || !(ledger ? data : data?.[0])) {
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
  const row = ledger ? data : data[0];
  const usage = ledger ? usageFromRow(row.usage ?? {}) : usageFromRpc(row);
  if (!row.allowed) {
    const messages: Record<string, string> = {
      quota_exceeded: "이번 달 이미지 생성 한도를 모두 사용했습니다.",
      // 내 한도가 아니라 팀 한도에 걸린 것이다. 같은 말로 뭉뚱그리면 「내
      // 한도를 늘려 달라」고 운영자에게 말하게 되는데 그래도 안 풀린다.
      team_quota_exceeded: "팀의 이번 달 생성 한도를 모두 사용했습니다. 팀장에게 문의해 주세요.",
      concurrent_limit: "이미 생성 중인 요청이 있습니다. 완료 후 다시 시도해 주세요.",
      analysis_rate_limit: "분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      /*
        **같은 말, 다른 reason**(C-9). 사용자가 할 일은 「잠시 후 다시」로 같다.
        가른 이유는 운영이다 — 한도(시간당 10)에 걸린 것과 남용 천장(시간당
        100)에 걸린 것은 할 일이 정반대다. reason 까지 같으면 구분할 길이 없다.
      */
      analysis_abuse_limit: "분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      credit_account_not_activated: "크레딧 계정 전환이 준비 중입니다. 운영자에게 문의해 주세요.",
      credit_quote_required: "이 생성 경로의 크레딧 설정을 확인해야 합니다.",
      credit_ledger_required: "새 크레딧 처리가 준비 중입니다. 잠시 후 다시 시도해 주세요.",
    };
    // 전환한 계정에는 「이번 달 한도」라는 말이 없다. 남은 것은 잔액이다.
    if (usage.pricingPolicy === "image-v2") messages.quota_exceeded = `크레딧이 모자랍니다. 사용 가능 ${usage.remaining}크레딧입니다.`;
    /*
      **중복일 때만 표를 한 번 더 읽는다**(E-6-2-b).

      한 문장으로 뭉뚱그리던 자리다. 무엇이 일어났는지는 그 행의 상태가 안다.
      다른 거절 사유에는 이 왕복을 걸지 않는다 — 한도에 걸린 것은 표를 안
      읽어도 할 말이 정해져 있다.
    */
    const message =
      row.reason === "duplicate_request"
        ? await duplicateRequestMessage(admin, auth.member.userId, requestId, operation)
        : messages[row.reason] ?? "요청을 처리할 수 없습니다.";
    const status = ["quota_exceeded", "team_quota_exceeded", "concurrent_limit", "analysis_rate_limit", "analysis_abuse_limit"]
      .includes(row.reason) ? 429 : 409;
    return {
      ok: false,
      response: membershipApiError(status, row.reason, message, usage),
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
/**
 * 성공한 결과를 돌려주는 길에서 장부를 닫는다. **던지지 않는다.**
 *
 * `finalizeAiUsage` 는 RPC 가 흔들리면 던진다. 그것이 성공 경로의 `try` 안에
 * 있으면, 이미 만들어 낸 결과가 catch 로 빨려 들어가 **생성 실패인 척하는
 * 오류**로 바뀐다. 사용자는 「분석 실패」를 보고 다시 눌러 돈을 또 쓴다.
 *
 * 포스터와 카드뉴스는 같은 자리를 이미 `try { … } catch {}` 로 감싸고
 * 「사용자가 만든 것을 못 보는 것이 더 나쁘다」고 적어 두었다. 그 판단을
 * 한 곳에 모은다 — 묶인 장은 예약이 만료되면 풀린다.
 *
 * 못 닫았으면 `undefined` 를 준다. 부르는 쪽은 사용량 칸만 비우면 된다.
 */
export async function settleAiUsage(
  reservation: { userId: string; requestId: string },
  success: boolean,
  consumedUnits: number,
  errorCode?: string,
  cost?: { model: string; billableImages: number; llmUsd?: number; deliveredImages?: number; completionConfirmed?: boolean },
) {
  try {
    return await finalizeAiUsage(reservation, success, consumedUnits, errorCode, cost);
  } catch {
    // 이미 `logUsageFailure` 가 사용자 id 와 요청 id 를 남겼다. 손으로 풀 수 있다.
    return undefined;
  }
}

/**
 * **같은 식별자로 다시 왔을 때 무슨 말을 할 것인가**(E-6-2-b).
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 화면은 같은 섹션을 다시 만들 때 **같은 요청 식별자**를 쓴다
 * (`PdpEditor` 의 `retryRequestKeysRef`). 두 번 과금되지 않게 하려는 장치다.
 *
 * 그 식별자로 다시 오면 `reserve_generation` 은 무조건 `duplicate_request` 를
 * 준다. 앱은 한 문장으로 답했다 — 「이미 처리된 요청입니다. **새로고침 후 다시
 * 시도해 주세요.**」
 *
 * 그 한 문장이 서로 다른 세 상황을 덮고 있었고, **셋 중 무엇도 새로고침으로
 * 안 풀린다.** 특히 이미 끝난 요청이면 「다시 시도」가 **값을 한 번 더** 내게
 * 만든다 — 단건 생성은 결과를 되찾는 길이 아예 없다(일괄만 job 을 남기고,
 * 그 job 도 `PDP_JOBS_ENABLED` 가 꺼져 있다).
 *
 * 설계 §14.5(E-6-2-b): 「header 존재 = **결과 복구 아님**」.
 *
 * ── 표가 아는 것을 말한다 ────────────────────────────────────
 *
 * 마이그레이션은 안 건드린다. `generation_events` 의 그 행을 한 번 더 읽으면
 * 상태를 알 수 있다.
 */
/**
 * **작업을 적는 갈래**(K-05 리뷰 HIGH).
 *
 * `reserveAiUsage` 는 열여섯 곳이 쓰는데 `createJobRecorder` 를 부르는 것은
 * `api/pdp/images/batch/route.ts` 하나뿐이다. 나머지에 「되찾을 수 있다」고
 * 말하면 **구성안 분석 중복에도 「만들어 둔 이미지」를 말하게 된다.**
 *
 * 단건 `/pdp/images` 도 같은 `pdp_image` 다. 그쪽은 작업을 안 남기지만,
 * 되찾기는 요청 식별자가 아니라 **문서 번호로** 찾으므로 앞선 묶음이 남긴
 * 작업을 찾아 빈 섹션을 채울 수 있다.
 *
 * 작업을 적는 라우트가 늘면 여기도 함께 는다. 한 곳에 적어 둔다.
 */
const KEEPS_JOBS = new Set<GenerationOperation>(["pdp_image"]);

async function duplicateRequestMessage(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  requestId: string,
  operation: GenerationOperation,
): Promise<string> {
  const { data } = await admin
    .from("generation_events")
    .select("status")
    .eq("user_id", userId)
    .eq("request_id", requestId)
    .maybeSingle();

  const status = (data as { status?: string } | null)?.status;

  if (status === "reserved") {
    return "같은 요청이 아직 처리 중입니다. 잠시 기다리면 결과가 나타납니다.";
  }
  if (status === "succeeded") {
    /*
      **되찾을 수 있게 됐으면 그렇게 말한다**(K-05).

      설계 §14.5(E-6-2-b) 의 처리는 「header 만 아닌 **동일 결과 회수**」다.
      작업 경로가 켜져 있으면 서버가 그 그림을 들고 있으므로
      (`GET /api/pdp/jobs?documentId=`) 값을 안 내고 되찾을 수 있다.

      **꺼져 있으면 옛 말이 맞다.** 값은 나갔고 그림도 만들어졌는데 화면에 못
      왔고, 되찾을 길이 없다 — 여기가 제일 나쁘다.
    */
    if (isPdpJobsEnabled() && KEEPS_JOBS.has(operation)) {
      /*
        **단정하지 않는다.** 깃발이 켜져 있어도 그 요청의 작업이 실제로
        있다는 보장은 없다 — 기록기가 조용히 실패했을 수 있고, 저장 안 한
        초안은 찾을 열쇠조차 없다. 「모르는 것을 안다고 하지 않는다」.
      */
      return "이 요청은 이미 끝났습니다. 만들어 둔 이미지가 남아 있으면 화면이 되찾아 옵니다. 잠시 뒤에도 안 보이면 새로 만들어 주세요.";
    }
    return "이 요청은 이미 끝났습니다. 결과가 화면에 안 보이면 다시 만들면 되지만, 다시 만들면 값이 한 번 더 나갑니다.";
  }
  if (status === "failed") {
    return "이 요청은 실패로 끝났습니다. 새로 만들어 주세요.";
  }
  // 표를 못 읽었다. **모르는 것을 안다고 하지 않는다.**
  return "같은 요청이 이미 접수돼 있습니다. 잠시 뒤에도 결과가 안 보이면 새로 만들어 주세요.";
}

export async function finalizeAiUsage(
  reservation: { userId: string; requestId: string },
  success: boolean,
  consumedUnits: number,
  errorCode?: string,
  cost?: { model: string; billableImages: number; llmUsd?: number; deliveredImages?: number; completionConfirmed?: boolean },
) {
  if (isLocalAuthBypass) return devUsageSummary;
  const admin = createSupabaseAdminClient();
  const ledger = isCreditLedgerEnabled();
  const { data, error } = await admin.rpc(ledger ? "credit_finalize_dispatch" : "finalize_generation", ledger ? {
    p_user: reservation.userId, p_request: reservation.requestId, p_success: success, p_legacy_units: consumedUnits,
    p_delivered: cost?.deliveredImages ?? (success ? null : 0), p_terminal: cost?.completionConfirmed ?? success, p_error: errorCode ?? null,
  } : {
    p_user_id: reservation.userId,
    p_request_id: reservation.requestId,
    p_success: success,
    p_consumed_units: consumedUnits,
    p_error_code: errorCode ?? null,
  });
  if (error || !(ledger ? data : data?.[0])) {
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

  /**
   * **0장이어도 적는다.**
   *
   * 전에는 `billableImages > 0` 일 때만 적었다. 그래서 실패한 요청은 모델도
   * 장수도 빈 채로 남았고, `admin_cost_summary` 의 「낭비」가 언제나 $0 이었다 —
   * 실패가 다섯 건인데도 그랬다. **낭비가 안 보이면 줄일 수도 없다.**
   *
   * 실패했는데 정말 0장이면 0을 적는 것이 맞다. 「돈이 안 나갔다」와 「모른다」는
   * 다르고, 지금까지는 둘이 같은 모양이었다.
   */
  let costRecorded: boolean | undefined;
  if (cost) {
    /*
      **모르는 것과 0원인 것을 가른다**(설계 §7.2).

      전에는 `llm_usd: cost.llmUsd ?? 0` 이라 셋이 전부 0 으로 보였다 —
      정말 0원인 것, 제공자가 사용량을 안 준 것, 기록이 실패한 것.

      모를 때는 **금액 칸을 아예 안 건드린다.** 0 을 적으면 「돈이 안 나갔다」가
      되고, 그 뒤로는 되돌릴 근거가 없다.
    */
    const 금액을안다 = typeof cost.llmUsd === "number" && Number.isFinite(cost.llmUsd);
    const { error: costError } = await admin
      .from("generation_events")
      .update({
        model: cost.model,
        billable_images: cost.billableImages,
        // 그림이 없는 단계(분석·기획)도 여기로 원가가 들어온다.
        ...(금액을안다 ? { llm_usd: cost.llmUsd } : {}),
        cost_state: 금액을안다 ? "recorded" : "unknown",
      })
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
    /*
      **정산만 됐다고 원가 기록까지 됐다고 하지 않는다**(설계 §8.4).

      사용량 확정은 되돌리지 않는다 — 장부가 조금 비는 것보다 회원의 크레딧이
      예약된 채 묶이는 쪽이 훨씬 나쁘다. 다만 **부르는 쪽이 알 수 있게** 한다.
    */
    costRecorded = !costError;
  }

  /*
    **원가 기록 여부는 두 정책에 다 실린다.** 정산이 됐다고 원가까지 남았다고
    말하지 않는 것은(설계 §8.4) 장부를 켜든 안 켜든 같은 약속이다.
  */
  const recorded = costRecorded === undefined ? {} : { costRecorded };
  return ledger
    ? { ...usageFromRow(data.usage ?? {}), settlementPending: data.settled === false, ...recorded }
    : { ...usageFromRpc(data[0]), ...recorded };
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
