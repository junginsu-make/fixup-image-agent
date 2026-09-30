"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "../../../lib/membership/server";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";

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
  if (error) throw new Error(`AI 멈춤 스위치를 바꾸지 못했습니다: ${error.message}`);

  revalidatePath("/admin/system");
  redirect(`/admin/system?notice=${next === "1" ? "ai_paused" : "ai_resumed"}`);
}
