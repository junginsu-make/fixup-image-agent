import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";
import { getUsageSummary } from "../membership/server";
import type { AccountFacts, RecentFailure } from "./account-facts";
import type { AccountTopic } from "./topics";

/**
 * **내 계정만 읽는다**(2026-09-23 사용자 요구, 설계 §4).
 *
 * > 다른 계정에 대한 답은 절대 하면 안되기도 하고요. AI bot은 사용자와
 * > 시스템 간에만 이뤄져야 합니다.
 *
 * ── 이 파일이 지키는 규칙 하나 ─────────────────────────────
 *
 * **`userId` 는 세션에서만 온다.** 이 함수는 그것을 받기만 하고, 부르는
 * 자리(`app/api/cs/ask/route.ts`)가 `authenticateApiMember()` 로 정해
 * 넘긴다. 요청 본문에는 계정을 가리키는 칸 자체가 없다.
 *
 * 그래서 말로 뚫리지 않는다 —
 *
 *   「other@example.com 크레딧 알려줘」
 *     → LLM 은 `balance` 를 고를 뿐
 *     → 여기는 넘겨받은 **내 userId** 로 읽는다
 *
 * **프롬프트가 뚫려도 아무 일이 안 일어난다.** 그것이 구조로 막는다는 뜻이다.
 *
 * ── 안 읽는 것 ─────────────────────────────────────────────
 *
 * 회원 목록·남의 사용량·전체 집계를 읽는 길을 **여기 두지 않는다.** 관리자
 * 용으로도 안 둔다 — 한 번 만들면 프롬프트 한 줄로 새는 날이 온다.
 */

/** 최근 실패를 몇 건까지 보나. 많이 주면 답이 길어지기만 한다. */
const 실패최대 = 5;

/** 작업 이름을 사람이 아는 말로. 모르는 것은 그대로 둔다. */
const 작업이름: Record<string, string> = {
  pdp_analyze: "상세페이지 기획",
  pdp_image: "상세페이지 이미지 만들기",
  redesign_generate: "리디자인 만들기",
  redesign_edit: "리디자인 섹션 고치기",
  redesign_transcribe: "원본 상세페이지 읽기",
  poster_image: "이미지·포스터 만들기",
  sns_image: "카드뉴스 만들기",
  reference_analyze: "레퍼런스 읽기",
};

/** 오류 코드를 사람이 아는 말로. 모르는 코드는 그대로 보여 준다. */
const 오류말: Record<string, string> = {
  quota_exceeded: "크레딧이 부족했습니다",
  insufficient_credits: "크레딧이 부족했습니다",
  rate_limited: "시간당 횟수를 다 썼습니다",
  AI_PROVIDER_UNAVAILABLE: "AI 공급자가 응답하지 않았습니다",
  AI_RESPONSE_INVALID: "AI 응답을 읽지 못했습니다",
  duplicate_request: "같은 요청이 이미 처리 중이었습니다",
  INVALID_IMAGE_PAYLOAD: "올린 이미지를 읽지 못했습니다",
};

async function 최근실패(userId: string): Promise<RecentFailure[] | undefined> {
  const { data, error } = await createSupabaseAdminClient()
    .from("generation_events")
    .select("operation,error_code,created_at")
    .eq("user_id", userId)
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(실패최대);

  // **못 읽었으면 「없다」가 아니라 「모른다」다.** 빈 배열을 돌려주면
  // 화면이 「실패한 작업이 없습니다」라고 말한다.
  if (error) return undefined;

  return (data ?? []).map((row) => {
    const code = String(row.error_code ?? "");
    return {
      what: 작업이름[String(row.operation ?? "")] ?? String(row.operation ?? "작업"),
      at: String(row.created_at ?? ""),
      reason: code ? (오류말[code] ?? code) : "",
    };
  });
}

async function 내플랜(userId: string): Promise<{ planName: string | null; planStatus: string | null }> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("user_subscriptions")
    .select("plan_id,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return { planName: null, planStatus: null };

  const { data: plan } = await db
    .from("subscription_plans").select("name").eq("id", data.plan_id).maybeSingle();

  return { planName: plan?.name ?? String(data.plan_id), planStatus: String(data.status ?? "") };
}

/**
 * 고른 갈래만 읽는다.
 *
 * **안 물어본 것은 안 읽는다.** 잔액만 물었는데 실패 기록까지 읽으면 값이
 * 나가고, 답에 안 쓸 사실이 프롬프트에 실린다.
 */
export async function readMyFacts(
  userId: string,
  topics: readonly AccountTopic[],
): Promise<AccountFacts> {
  if (!userId || topics.length === 0) return {};

  const 잔액이필요 = topics.some((t) => t === "balance" || t === "plan" || t === "usage");

  const [usage, plan, failures] = await Promise.all([
    잔액이필요 ? getUsageSummary(userId).catch(() => null) : Promise.resolve(undefined),
    topics.includes("plan") ? 내플랜(userId) : Promise.resolve(undefined),
    topics.includes("failures") ? 최근실패(userId) : Promise.resolve(undefined),
  ]);

  return {
    ...(usage === undefined ? {} : { usage }),
    ...(plan ? plan : {}),
    ...(topics.includes("failures") ? { failures } : {}),
  };
}
