"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { sendApprovalEmail, sendConfirmationEmail, sendPasswordResetEmail } from "../../lib/email/approval";
import { updateProfileExtras } from "../../lib/membership/profile-store";
import { requireAdmin } from "../../lib/membership/server";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { isCreditLedgerEnabled } from "../../lib/membership/credit-ledger";
import { ledgerMissing } from "../../lib/membership/usage-row";
import { isDisabledRoute } from "../../lib/access/routes";
import { failureUrl, teamFailure } from "../../lib/teams/failure";
import { setModelPrice, setUsdKrw } from "../../lib/cost";
import { setAiBadgeEnabled } from "../../lib/ai-badge-setting";
import { assignMember, removeMember, setMemberRole } from "../../lib/teams/store";
import {
  ADMIN_DELETE_MESSAGE,
  OWNER_PROTECTED_MESSAGE,
  canDeleteAdmin,
  canManageTarget,
  isOwnerEmail,
  resolveOwnerEmail,
} from "../../lib/membership/owner";

/** 돈 기록이 있는 회원. 지우지 않고 정지한다(202609220003). */
const MONEY_RECORDS_MESSAGE = "크레딧 지급·구독 기록이 있는 회원은 지울 수 없습니다. 대신 정지해 주세요.";

function readUserId(formData: FormData) {
  const userId = String(formData.get("userId") || "");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("올바르지 않은 회원 ID입니다.");
  return userId;
}

/**
 * 회원 하나를 손대기 전에 거치는 문.
 *
 * **관리자라는 것만으로는 부족하다.** 관리자가 둘이 되면서 서로를 지우거나
 * 정지시킬 수 있게 되었고, 그러면 한 번의 실수로 되돌릴 수 없는 사고가 난다 —
 * 관리자를 되살리는 길은 화면에 없고 DB 를 직접 열어야 한다.
 *
 * 소유자 계정은 다른 관리자가 손대지 못한다. 화면에서 단추를 감추는 것으로는
 * 못 막는다. 서버 액션은 주소만 알면 직접 부를 수 있다.
 *
 * 대상의 프로필을 함께 돌려준다. 부르는 쪽이 또 한 번 읽지 않게 한다.
 */
async function requireAdminFor(userId: string) {
  const current = await requireAdmin();
  const admin = createSupabaseAdminClient();
  const { data: target, error } = await admin
    .from("profiles")
    .select("email,role,status,email_confirmed_at")
    .eq("id", userId)
    .single();
  if (error || !target) throw new Error("회원 정보를 찾지 못했습니다.");

  const owner = resolveOwnerEmail(process.env.OWNER_EMAIL);
  if (!canManageTarget({ actorEmail: current.profile.email, targetEmail: target.email, owner })) {
    throw new Error(OWNER_PROTECTED_MESSAGE);
  }
  return { current, target, admin, owner };
}

export async function approveMember(formData: FormData) {
  const userId = readUserId(formData);
  const { current: adminMember, admin } = await requireAdminFor(userId);
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
  const userId = readUserId(formData);
  const { current, admin, target } = await requireAdminFor(userId);
  const status = String(formData.get("status") || "");
  if (!['active', 'suspended'].includes(status)) throw new Error("올바르지 않은 상태입니다.");
  if (userId === current.user.id && status === "suspended") throw new Error("현재 관리자 계정은 정지할 수 없습니다.");
  const profile = target;
  const validTransition =
    (profile.status === "active" && status === "suspended") ||
    (profile.status === "suspended" && status === "active" && profile.email_confirmed_at);
  if (!validTransition) throw new Error("허용되지 않은 회원 상태 변경입니다.");
  const { error } = await admin.from("profiles").update({ status, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

export async function updateQuota(formData: FormData) {
  const userId = readUserId(formData);
  const { admin } = await requireAdminFor(userId);
  if (isCreditLedgerEnabled()) {
    const { data: account, error } = await admin.from("credit_accounts").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (account) throw new Error("전환한 회원의 크레딧은 회원·크레딧 관리에서 지급하거나 회수해 주세요.");
  }
  const quota = Number(formData.get("quota"));
  if (!Number.isInteger(quota) || quota < 0 || quota > 10000) throw new Error("한도는 0~10000 사이 정수여야 합니다.");
  const { error } = await admin.from("profiles").update({ monthly_quota: quota, updated_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
  revalidatePath("/admin");
}

export async function resendApproval(formData: FormData) {
  const userId = readUserId(formData);
  const { admin, target: profile } = await requireAdminFor(userId);
  if (profile.status !== "active") throw new Error("승인된 회원을 찾지 못했습니다.");
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
  redirect("/admin/system?notice=price_updated");
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
  redirect(`/admin/system?notice=${next === "on" ? "badge_on" : "badge_off"}`);
}

function readShowcaseId(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("올바르지 않은 갤러리 항목입니다.");
  return id;
}




export async function updateUsdKrw(formData: FormData) {
  await requireAdmin();
  const raw = Number(formData.get("usdKrw"));
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100000) {
    throw new Error("환율은 0보다 크고 100,000 이하여야 합니다.");
  }
  await setUsdKrw(Math.round(raw));
  revalidatePath("/admin");
  redirect("/admin/system?notice=rate_updated");
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
  const userId = readUserId(formData);
  const typed = String(formData.get("confirmEmail") || "").trim().toLowerCase();
  const { current, target: profile, admin, owner } = await requireAdminFor(userId);

  if (userId === current.user.id) throw new Error("자기 계정은 지울 수 없습니다.");

  /*
    **관리자는 소유자만 지운다.**

    전에는 관리자면 누구도 못 지웠다. 관리자가 하나뿐일 때는 그것으로 충분했지만,
    둘이 되면서 잘못 만든 관리자 계정을 내릴 길이 아예 없어졌다 — 관리자를 일반
    회원으로 내리는 기능이 화면에 없어서, DB 를 직접 열어야 했다.

    소유자는 자기를 못 지우므로(바로 위 검사), 결과적으로 소유자 계정은
    화면에서 사라지지 않는다.
  */
  if (profile.role === "admin" && !canDeleteAdmin(current.profile.email, owner)) {
    throw new Error(ADMIN_DELETE_MESSAGE);
  }
  if (typed !== String(profile.email).trim().toLowerCase()) {
    throw new Error("지우려는 회원의 이메일을 그대로 입력해 주세요.");
  }

  /*
    크레딧 지급·구독 기록이 있으면 DB 가 삭제를 막는다(돈 기록은 회원과 함께 지우지
    않는다, 202609220003). 막힌 뒤의 「Database error deleting user」는 이유를 안
    알려 주므로 먼저 묻는다. 함수가 아직 없는 서버(003 전)에서는 막을 기록도 없다.
  */
  const { data: kept, error: keptError } = await admin.rpc("credit_member_has_records", { p_user: userId });
  if (keptError && !ledgerMissing(keptError)) throw new Error(`삭제 가능 여부를 확인하지 못했습니다: ${keptError.message}`);
  if (kept === true) throw new Error(MONEY_RECORDS_MESSAGE);

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
  const userId = readUserId(formData);
  const { admin, target: profile } = await requireAdminFor(userId);
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
  await adminTeamAttempt(async () => {
    const userId = readUserId(formData);
    await requireAdminFor(userId);
    const teamId = String(formData.get("teamId") || "");

    // 「팀 없음」을 고르면 뺀다. 혼자인 팀이면 팀을 접는다(`leaveOutcome`).
    if (!teamId) return (await removeMember(userId)) === "archived" ? "/admin?notice=team_archived" : "/admin?notice=team_removed";

    if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error("올바르지 않은 팀 ID입니다.");
    await assignMember(userId, teamId);
    return "/admin?notice=team_assigned";
  });
}

/** 팀장 · 팀원을 바꾼다. 마지막 팀장은 못 내린다 — `setMemberRole` 이 막는다. */
export async function setTeamRoleFromAdmin(formData: FormData) {
  await adminTeamAttempt(async () => {
    const userId = readUserId(formData);
    await requireAdminFor(userId);
    const role = formData.get("role") === "leader" ? "leader" : "member";
    await setMemberRole(userId, role);
    return `/admin?notice=${role === "leader" ? "team_promoted" : "team_demoted"}`;
  });
}

/**
 * 팀 편성은 던지지 않고 돌려보낸다. 던지면 운영에서는 회원 관리 화면 전체가
 * 「server-side exception」으로 바뀐다(2026-09-22 Digest 4200012665, 원인은
 * 「마지막 팀장은 뺄 수 없습니다」). 팀 기능이 꺼져 있으면 아무것도 바꾸지 않는다.
 */
async function adminTeamAttempt(work: () => Promise<string>): Promise<never> {
  let target: string;
  try {
    if (isDisabledRoute("/team")) throw new Error("팀 기능은 지금 꺼 두었습니다.");
    target = await work();
  } catch (cause) {
    unstable_rethrow(cause);
    target = failureUrl("/admin", teamFailure(cause));
  }
  revalidatePath("/admin");
  redirect(target);
}

/* ── 회원 정보 — 관리자 회원 관리 패널에서 ─────────────────────────── */

/*
  화면이 결과를 받아 그 자리에서 알려 준다. 그래서 이 셋은 던지지도 돌려보내지도 않고
  `{ ok, message }` 를 돌려준다. 소유자 보호(`requireAdminFor`)는 다른 회원 액션과 같다.
*/
type MemberResult = { ok: boolean; message: string };

async function memberAttempt(userId: string, work: (target: Awaited<ReturnType<typeof requireAdminFor>>) => Promise<MemberResult>): Promise<MemberResult> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, message: "올바르지 않은 회원 ID입니다." };
    return await work(await requireAdminFor(userId));
  } catch (cause) {
    unstable_rethrow(cause);
    const message = cause instanceof Error ? cause.message : "";
    if (/[가-힣]/.test(message)) return { ok: false, message };
    console.error("[admin] 회원 정보 처리 실패", cause);
    return { ok: false, message: "처리하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

/** 메일로 보낼 재설정 주소. `/auth/confirm` 이 token_hash 로 확인하고 `/reset-password` 로 보낸다. */
function recoveryUrl(siteUrl: string, hashedToken: string): string {
  const url = new URL("/auth/confirm", siteUrl);
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", "recovery");
  url.searchParams.set("next", "/reset-password");
  return url.toString();
}

/**
 * 다른 관리자의 비밀번호는 **소유자만** 바꾼다. 관리자 A 가 관리자 B 의 비밀번호를 정하면
 * B 로 들어갈 수 있다 — 관리자 지우기가 소유자만인 것과 같은 무게다(독립 리뷰 2026-09-22).
 */
function adminPasswordGuard(target: { role: string }, actorEmail: string): string | null {
  if (target.role !== "admin") return null;
  return isOwnerEmail(actorEmail, resolveOwnerEmail(process.env.OWNER_EMAIL)) ? null : "다른 관리자의 비밀번호는 소유자만 바꿀 수 있습니다.";
}

/** 회원 이름·추천인을 관리자가 고친다. */
export async function adminUpdateMemberProfile(userId: string, input: { name: string; referrer: string }): Promise<MemberResult> {
  return memberAttempt(userId, async () => {
    const result = await updateProfileExtras(userId, { name: String(input?.name ?? ""), referrer: String(input?.referrer ?? "") });
    if (result.ok) revalidatePath("/admin");
    return result;
  });
}

/**
 * 비밀번호 재설정 메일을 보낸다. **관리자는 새 비밀번호를 모른다** — 회원이 메일의 링크로
 * 직접 정한다. 기본은 이것이다(2026-09-22 사용자 결정: 메일 + 직접 지정 둘 다).
 */
export async function adminSendPasswordReset(userId: string): Promise<MemberResult> {
  return memberAttempt(userId, async ({ admin, target, current }) => {
    const blocked = adminPasswordGuard(target, current.profile.email);
    if (blocked) return { ok: false, message: blocked };
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
    if (!siteUrl) return { ok: false, message: "NEXT_PUBLIC_SITE_URL 이 설정되지 않아 메일을 보낼 수 없습니다." };
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: target.email,
      options: { redirectTo: `${siteUrl}/auth/confirm?next=/reset-password` },
    });
    /*
      **action_link 를 그대로 보내지 않는다.** 그 링크는 로그인 토큰을 주소 뒤(#)에 실어 돌려
      보내는데, `/auth/confirm` 은 서버라 그 부분을 못 읽어 로그인 오류 화면으로 간다(독립 리뷰
      2026-09-22). 해시 토큰으로 우리 주소를 직접 만든다 — 그 라우트가 verifyOtp 로 재설정
      세션을 세운 뒤 비밀번호 정하는 화면으로 보낸다.
    */
    const hashed = link?.properties?.hashed_token;
    if (error || !hashed) return { ok: false, message: `재설정 링크를 만들지 못했습니다: ${error?.message ?? "링크 없음"}` };
    await sendPasswordResetEmail(target.email, recoveryUrl(siteUrl, hashed));
    return { ok: true, message: `${target.email} 로 비밀번호 재설정 메일을 보냈습니다.` };
  });
}

/**
 * 관리자가 새 비밀번호를 직접 정한다. 메일을 못 받는 회원을 급히 돕는 길이다.
 *
 * 관리자가 그 비밀번호를 알게 되므로 회원에게 알려 주고 **로그인 뒤 바꾸라고 안내한다**
 * (화면 문구). 규칙은 가입·재설정과 같다(8자 이상).
 */
export async function adminSetMemberPassword(userId: string, password: string): Promise<MemberResult> {
  return memberAttempt(userId, async ({ admin, target, current }) => {
    if (typeof password !== "string" || password.length < 8) return { ok: false, message: "새 비밀번호는 8자 이상이어야 합니다." };
    if (password.length > 72) return { ok: false, message: "새 비밀번호는 72자까지 정할 수 있습니다." };
    if (userId === current.user.id) return { ok: false, message: "내 비밀번호는 계정 화면에서 바꿔 주세요." };
    const blocked = adminPasswordGuard(target, current.profile.email);
    if (blocked) return { ok: false, message: blocked };
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return { ok: false, message: `비밀번호를 바꾸지 못했습니다: ${error.message}` };
    // 누가 누구의 비밀번호를 정했는지 서버 기록에 남긴다. 비밀번호 자체는 남기지 않는다.
    console.info("[admin] 비밀번호 직접 지정", { actor: current.user.id, target: userId });
    return { ok: true, message: `${target.email} 의 비밀번호를 바꿨습니다. 그 회원은 다른 기기에서 다시 로그인해야 할 수 있습니다. 회원에게 알려 주고, 로그인한 뒤 계정 화면에서 바꾸라고 안내하세요.` };
  });
}
