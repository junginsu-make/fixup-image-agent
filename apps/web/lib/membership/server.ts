import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { devMembership, devUsageSummary, isLocalAuthBypass } from "../dev-auth";
import type { MemberProfile, MembershipContext, UsageSummary } from "./types";
import { canAccessPage, viewerFrom } from "../access/core";
import { PAGE_ACCESS } from "../access/routes";

export const getMembership = cache(async (): Promise<MembershipContext | null> => {
  if (isLocalAuthBypass) return devMembership;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;
  return {
    user: { id: user.id, email: user.email },
    profile: profile as MemberProfile,
  };
});

export async function requireSignedIn() {
  const membership = await getMembership();
  if (!membership) redirect("/login");
  return membership;
}

export async function requireActiveMember() {
  const membership = await requireSignedIn();
  if (!membership.profile.email_confirmed_at || membership.profile.status !== "active") {
    redirect("/access");
  }
  return membership;
}

/**
 * 관리자 화면의 문지기.
 *
 * 미들웨어가 이미 막지만 여기서 한 번 더 본다 — 미들웨어는 경로로 판단하고,
 * 이건 실제로 그 화면을 그리기 직전이다. 라우트 설정이 바뀌거나 미들웨어를
 * 안 타는 길이 생겨도 화면 자체는 안 열린다.
 */
export async function requireAdmin() {
  const membership = await requireActiveMember();
  const viewer = viewerFrom({ userId: membership.user.id, profile: membership.profile });
  if (!canAccessPage("/admin", viewer, PAGE_ACCESS)) redirect("/create");
  return membership;
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  if (isLocalAuthBypass) return devUsageSummary;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("member_usage_summary", { p_user_id: userId });
  if (error || !data?.[0]) throw error ?? new Error("회원 사용량을 찾지 못했습니다.");
  const row = data[0];
  const used = Number(row.used_units);
  const reserved = Number(row.reserved_units);
  const quota = Number(row.quota);
  return {
    used,
    reserved,
    quota,
    remaining: Math.max(0, quota - used - reserved),
    periodStart: String(row.current_period_start),
    periodEnd: String(row.current_period_end),
  };
}
