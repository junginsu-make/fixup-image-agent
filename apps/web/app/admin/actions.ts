"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendApprovalEmail } from "../../lib/email/approval";
import { requireAdmin } from "../../lib/membership/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { setModelPrice, setUsdKrw } from "../../lib/cost";

function readUserId(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("올바르지 않은 회원 ID입니다.");
  return userId;
}

export async function approveMember(formData: FormData) {
  const adminMember = await requireAdmin();
  const userId = readUserId(formData);
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .update({ status: "active", approved_at: new Date().toISOString(), approved_by: adminMember.user.id, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("status", "pending")
    .not("email_confirmed_at", "is", null)
    .select("email")
    .single();
  if (error || !profile) throw new Error("이메일 인증을 마친 승인 대기 회원만 승인할 수 있습니다.");
  try {
    await sendApprovalEmail(profile.email);
    await admin.from("profiles").update({ approval_notified_at: new Date().toISOString() }).eq("id", userId);
  } catch {
    revalidatePath("/admin");
    redirect("/admin?notice=approved_email_failed");
  }
  revalidatePath("/admin");
  redirect("/admin?notice=approved");
}

export async function setMemberStatus(formData: FormData) {
  const current = await requireAdmin();
  const userId = readUserId(formData);
  const status = String(formData.get("status") || "");
  if (!['active', 'suspended'].includes(status)) throw new Error("올바르지 않은 상태입니다.");
  if (userId === current.user.id && status === "suspended") throw new Error("현재 관리자 계정은 정지할 수 없습니다.");
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("status,email_confirmed_at")
    .eq("id", userId)
    .single();
  if (profileError || !profile) throw new Error("회원 정보를 찾지 못했습니다.");
  const validTransition =
    (profile.status === "active" && status === "suspended") ||
    (profile.status === "suspended" && status === "active" && profile.email_confirmed_at);
  if (!validTransition) throw new Error("허용되지 않은 회원 상태 변경입니다.");
  const { error } = await admin.from("profiles").update({ status, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

export async function updateQuota(formData: FormData) {
  await requireAdmin();
  const userId = readUserId(formData);
  const quota = Number(formData.get("quota"));
  if (!Number.isInteger(quota) || quota < 0 || quota > 10000) throw new Error("한도는 0~10000 사이 정수여야 합니다.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ monthly_quota: quota, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

export async function resendApproval(formData: FormData) {
  await requireAdmin();
  const userId = readUserId(formData);
  const admin = createSupabaseAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("email,status").eq("id", userId).single();
  if (error || !profile || profile.status !== "active") throw error ?? new Error("승인된 회원을 찾지 못했습니다.");
  await sendApprovalEmail(profile.email);
  await admin.from("profiles").update({ approval_notified_at: new Date().toISOString() }).eq("id", userId);
  revalidatePath("/admin");
  redirect("/admin?notice=email_sent");
}

/**
 * 모델 단가와 환율.
 *
 * 처음 넣은 값은 fal 공개 단가라 실제 청구서와 다를 수 있다. 코드에 박아 두면
 * 청구서를 보고도 못 고친다. 관리자가 화면에서 바꾼다.
 */
export async function updateModelPrice(formData: FormData) {
  await requireAdmin();
  const model = String(formData.get("model") || "");
  const raw = Number(formData.get("unitCostUsd"));
  if (!model) throw new Error("모델이 지정되지 않았습니다.");
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    throw new Error("단가는 0 이상 100 이하의 숫자여야 합니다.");
  }
  await setModelPrice(model, raw);
  revalidatePath("/admin");
  redirect("/admin?notice=price_updated");
}

export async function updateUsdKrw(formData: FormData) {
  await requireAdmin();
  const raw = Number(formData.get("usdKrw"));
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100000) {
    throw new Error("환율은 0보다 크고 100,000 이하여야 합니다.");
  }
  await setUsdKrw(Math.round(raw));
  revalidatePath("/admin");
  redirect("/admin?notice=rate_updated");
}
