"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { failureUrl } from "../../../lib/teams/failure";

/**
 * **AI 전체 멈춤 스위치를 바꾼다**(설계 2026-09-30 §3.3).
 *
 * 값 쓰기와 감사 한 줄(`credit_admin_events`, `ai_pause`/`ai_resume`)은 DB 함수
 * `admin_set_ai_paused` 가 한 트랜잭션으로 한다 — 둘을 앱에서 따로 쓰면 하나만 남는 날이 생긴다.
 * 그 함수도 관리자인지 다시 본다. 서버 액션은 **주소만 알면 직접 부를 수 있다**(`actions.ts` 의 같은 판단).
 */
export async function setAiPausedAction(formData: FormData) {
  const membership = await requireAdmin();
  const next = String(formData.get("paused") || "");
  if (next !== "1" && next !== "0") throw new Error("올바르지 않은 값입니다.");

  const { error } = await createSupabaseAdminClient().rpc("admin_set_ai_paused", {
    p_actor: membership.user.id,
    p_paused: next === "1",
    p_reason: next === "1" ? "관리자 화면에서 AI 전체 멈춤" : "관리자 화면에서 AI 다시 켜기",
  });
  if (error) {
    /*
      **던지지 않는다.** 서버 액션이 던지면 운영 빌드는 「server-side exception · Digest …」만
      남기고 안내가 사라진다 — 팀 편성 액션과 같은 판단(`admin/actions.ts` 의 `adminTeamAttempt`,
      2026-09-22). 실패는 다른 관리자 액션처럼 `?error=` 로 돌려보내 `AdminError` 가 한국어로
      그린다. RPC 원인은 DB 세부가 섞일 수 있어 화면에는 안 싣고 서버 기록에만 남긴다.
    */
    console.error("[ai-control] AI 멈춤 스위치를 바꾸지 못했습니다", { message: error.message });
    revalidatePath("/admin/system");
    redirect(failureUrl("/admin/system", "AI 멈춤 스위치를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요."));
    return;
  }

  revalidatePath("/admin/system");
  redirect(`/admin/system?notice=${next === "1" ? "ai_paused" : "ai_resumed"}`);
}
