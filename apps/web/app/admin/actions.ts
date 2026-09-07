"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendApprovalEmail, sendConfirmationEmail } from "../../lib/email/approval";
import { requireAdmin } from "../../lib/membership/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { setModelPrice, setUsdKrw } from "../../lib/cost";
import { setAiBadgeEnabled } from "../../lib/ai-badge-setting";
import { patchShowcaseItem, removeShowcaseItem, reorderShowcaseItem } from "../api/showcase/store";
import { assignMember, removeMember, setMemberRole } from "../../lib/teams/store";

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

/**
 * "AI 이미지" 표기를 켜고 끈다.
 *
 * 표기는 만든 그림 파일 안에 새긴다. 여기서 끄면 **그 뒤에 만드는 것부터**
 * 안 붙는다 — 이미 만들어 둔 그림은 그대로다. 다시 뽑아야 사라진다.
 */
export async function updateAiBadge(formData: FormData) {
  await requireAdmin();
  const next = String(formData.get("enabled") || "");
  if (next !== "on" && next !== "off") throw new Error("올바르지 않은 값입니다.");
  await setAiBadgeEnabled(next === "on");
  revalidatePath("/admin");
  redirect(`/admin?notice=${next === "on" ? "badge_on" : "badge_off"}`);
}

function readShowcaseId(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("올바르지 않은 갤러리 항목입니다.");
  return id;
}

/**
 * 첫 화면 갤러리 한 칸을 고친다 — 켜고 끄기, 문구.
 *
 * 끄기와 지우기를 나눈 이유는 하나다. 껐다가 다시 켜려고 설명을 처음부터
 * 다시 쓰게 하면 안 된다. 지우기는 복사본 파일까지 함께 없앤다.
 *
 * 빈 칸으로 낸 문구는 `null` 로 보낸다 — "안 보냈다"와 "지워 달라"는 다른
 * 뜻이고, 여기서는 관리자가 비웠으니 지워 달라는 뜻이다.
 */
export async function updateShowcase(formData: FormData) {
  await requireAdmin();
  const id = readShowcaseId(formData);
  const visible = String(formData.get("visible") || "");
  const hasText = formData.has("caption") || formData.has("kindLabel");

  const caption = String(formData.get("caption") || "").trim();
  const kindLabel = String(formData.get("kindLabel") || "").trim();
  if (caption.length > 200) throw new Error("설명은 200자를 넘길 수 없습니다.");
  if (kindLabel.length > 60) throw new Error("종류 이름표는 60자를 넘길 수 없습니다.");

  const result = await patchShowcaseItem({
    id,
    ...(visible === "on" || visible === "off" ? { visible: visible === "on" } : {}),
    ...(hasText ? { caption: caption || null, kindLabel: kindLabel || null } : {}),
  });
  if (!result.ok) throw new Error(result.message);

  revalidatePath("/admin");
  revalidatePath("/");
  redirect(`/admin?notice=${visible === "off" ? "showcase_off" : visible === "on" ? "showcase_on" : "showcase_saved"}`);
}

/** 갤러리에서 앞뒤로 한 칸 옮긴다. */
export async function moveShowcase(formData: FormData) {
  await requireAdmin();
  const id = readShowcaseId(formData);
  const direction = String(formData.get("direction") || "");
  if (direction !== "up" && direction !== "down") throw new Error("올바르지 않은 방향입니다.");

  const result = await reorderShowcaseItem(id, direction);
  if (!result.ok) throw new Error(result.message);

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?notice=showcase_moved");
}

/**
 * 갤러리에서 내리고 복사본까지 지운다.
 *
 * 원본 작업물은 그대로 남는다 — 여기서 지우는 것은 첫 화면에 걸려고 떠 둔
 * 한 벌뿐이다. 다시 걸고 싶으면 라이브러리에서 다시 걸면 된다.
 */
export async function removeShowcase(formData: FormData) {
  await requireAdmin();
  const id = readShowcaseId(formData);

  const result = await removeShowcaseItem(id);
  if (!result.ok) throw new Error(result.message);

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin?notice=showcase_removed");
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

/**
 * 회원을 아주 지운다.
 *
 * **되돌릴 수 없다.** 인증 계정을 지우면 그 사람이 만든 것들도 표에 걸린
 * `on delete cascade` 를 타고 같이 사라진다 — 작업물·참고 이미지·캐릭터·
 * 사용량 기록까지. 그래서 정지(`suspended`)와 다른 일이다. 다시 들어오게만
 * 막을 생각이면 정지를 쓴다.
 *
 * 막아 두는 것 셋:
 *
 * 1. **자기 자신은 못 지운다.** 지우는 순간 관리자가 사라져 아무도 못 들어온다
 * 2. **다른 관리자도 못 지운다.** 관리자끼리 서로 지우기 시작하면 마지막
 *    한 명이 남을 때까지 되돌릴 방법이 없다. 내리려면 먼저 권한을 낮춘다
 * 3. **이메일을 그대로 입력해야 한다.** 표에서 줄을 잘못 짚는 일이 흔하다
 */
export async function deleteMember(formData: FormData) {
  const current = await requireAdmin();
  const userId = readUserId(formData);
  const typed = String(formData.get("confirmEmail") || "").trim().toLowerCase();

  if (userId === current.user.id) throw new Error("자기 계정은 지울 수 없습니다.");

  const admin = createSupabaseAdminClient();
  const { data: profile, error: findError } = await admin
    .from("profiles")
    .select("email,role")
    .eq("id", userId)
    .single();
  if (findError || !profile) throw new Error("회원 정보를 찾지 못했습니다.");
  if (profile.role === "admin") {
    throw new Error("관리자는 지울 수 없습니다. 먼저 일반 회원으로 내린 뒤 지워 주세요.");
  }
  if (typed !== String(profile.email).trim().toLowerCase()) {
    throw new Error("지우려는 회원의 이메일을 그대로 입력해 주세요.");
  }

  // 인증 계정을 지운다. profiles 는 auth.users 를 참조하므로 함께 사라진다.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`회원을 지우지 못했습니다: ${error.message}`);

  revalidatePath("/admin");
  redirect("/admin?notice=deleted");
}

/**
 * 아직 이메일 인증을 안 한 회원에게 인증 메일을 다시 보낸다.
 *
 * 사용자도 `/access` 화면에서 직접 보낼 수 있다. 그런데 **로그인을 해야 그
 * 화면에 닿는다.** 메일이 통째로 안 왔거나 비밀번호를 잊은 사람은 거기까지
 * 못 간다. 그때 관리자가 대신 눌러 준다.
 *
 * 승인 메일(`resendApproval`)과 다른 것이다 — 그건 이미 승인된 사람에게 보내고,
 * 이건 인증 자체를 아직 안 한 사람에게 보낸다.
 *
 * **Supabase 의 재발송 API 는 못 쓴다.** 캡차를 요구하는데(실측 2026-09-04,
 * `captcha_failed`) 관리자 화면은 캡차를 띄울 자리가 아니다. 그래서 관리 키로
 * 링크만 만들고 메일은 우리 SMTP 로 보낸다.
 *
 * 링크는 `magiclink` 로 만든다. `signup` 은 **기존 계정의 비밀번호를 갱신하는
 * 부작용**이 있다 — 인증 메일을 다시 보내려다 남의 비밀번호를 바꾸면 안 된다.
 */
export async function resendConfirmation(formData: FormData) {
  await requireAdmin();
  const userId = readUserId(formData);
  const admin = createSupabaseAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("email,email_confirmed_at")
    .eq("id", userId)
    .single();
  if (error || !profile) throw new Error("회원 정보를 찾지 못했습니다.");
  if (profile.email_confirmed_at) throw new Error("이미 이메일 인증을 마친 회원입니다.");

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL 이 설정되지 않아 메일을 보낼 수 없습니다.");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
    options: { redirectTo: `${siteUrl}/auth/confirm?next=/access` },
  });
  const actionLink = link?.properties?.action_link;
  if (linkError || !actionLink) {
    throw new Error(`인증 링크를 만들지 못했습니다: ${linkError?.message ?? "링크 없음"}`);
  }

  await sendConfirmationEmail(profile.email, actionLink);

  revalidatePath("/admin");
  redirect("/admin?notice=confirm_sent");
}

/* ── 팀 편성 — 회원 명단에서 바로 ─────────────────────────────── */

/**
 * 팀 편성은 `/team` 이 하는데 왜 여기에도 두나.
 *
 * **운영자가 회원을 보는 곳은 여기다.** 승인하고 한도를 정하다가 팀을
 * 바꾸려면 화면을 옮겨야 하고, 옮기면 방금 보던 회원을 다시 찾아야 한다.
 * 회원 하나를 두고 하는 일은 한 자리에서 끝나야 한다.
 *
 * `/team` 의 액션을 그대로 못 쓰는 이유는 그쪽이 끝나고 `/team` 으로
 * 돌려보내기 때문이다. 명단에서 눌렀는데 팀 화면으로 튕기면 하던 일을 잃는다.
 */
export async function assignTeamFromAdmin(formData: FormData) {
  await requireAdmin();
  const userId = readUserId(formData);
  const teamId = String(formData.get("teamId") || "");

  // 「팀 없음」을 고르면 뺀다. 고르개 하나로 넣고 빼는 것이 둘 다 된다.
  if (!teamId) {
    await removeMember(userId);
    revalidatePath("/admin");
    redirect("/admin?notice=team_removed");
  }

  if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error("올바르지 않은 팀 ID입니다.");
  await assignMember(userId, teamId);
  revalidatePath("/admin");
  redirect("/admin?notice=team_assigned");
}

/** 팀장 · 팀원을 바꾼다. 마지막 팀장은 못 내린다 — `setMemberRole` 이 막는다. */
export async function setTeamRoleFromAdmin(formData: FormData) {
  await requireAdmin();
  const userId = readUserId(formData);
  const role = formData.get("role") === "leader" ? "leader" : "member";
  await setMemberRole(userId, role);
  revalidatePath("/admin");
  redirect(`/admin?notice=${role === "leader" ? "team_promoted" : "team_demoted"}`);
}
